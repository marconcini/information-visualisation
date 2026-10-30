"""
Pays d'origine des artistes d'après MusicBrainz, pour la carte.

Usage, depuis la racine du dépôt :
    python scripts/enrich_countries.py

Tous les artistes de tracks_clean.csv sont interrogés, du plus fréquent au
moins fréquent (MusicBrainz limite à une requête par seconde, environ 3 h).
Le script peut être arrêté avec Ctrl+C et relancé : il reprend grâce au cache.
Avec --retry-empty, les artistes restés sans pays sont interrogés à nouveau.
Quand MusicBrainz ne donne qu'une ville ou une région, on remonte les zones
parentes jusqu'au pays (Dumfries → Écosse → Royaume-Uni).
Le fichier data/derived/countries.json est réécrit régulièrement, la carte
fonctionne donc déjà avec un enrichissement partiel.
"""
import csv
import json
import os
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRACKS = os.path.join(ROOT, "data", "derived", "tracks_clean.csv")
OUT = os.path.join(ROOT, "data", "derived", "countries.json")
CACHE = os.path.join(ROOT, "scripts", "_artist_country_cache.json")
AREA_CACHE = os.path.join(ROOT, "scripts", "_area_country_cache.json")
ISO_URL = "https://cdn.jsdelivr.net/gh/lukes/ISO-3166-Countries-with-Regional-Codes@master/all/all.json"
UA = "SpotifyInfoVisProjet/1.0 (projet etudiant Polytech Nice Sophia)"
MIN_SCORE = 90
NOT_COUNTRIES = {"XE", "XW", "XU"}
SAVE_EVERY = 100
PAUSE = 1.1


_last_request = [0.0]


def get_json(url):
    wait = PAUSE - (time.time() - _last_request[0])
    if wait > 0:
        time.sleep(wait)
    _last_request[0] = time.time()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


def normalize(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = s.casefold().replace("&", " and ")
    return " ".join("".join(ch if ch.isalnum() else " " for ch in s).split())


def same_artist(candidate, name):
    target = normalize(name)
    names = [candidate.get("name", ""), candidate.get("sort-name", "")]
    names += [a.get("name", "") for a in candidate.get("aliases") or []]
    return any(normalize(n) == target for n in names if n)


def clean(code):
    return "" if not code or code in NOT_COUNTRIES else code


def area_country(area_id, areas):
    chain = []
    code = ""
    while area_id and len(chain) < 6:
        if area_id in areas:
            code = areas[area_id]
            break
        chain.append(area_id)
        data = get_json(f"https://musicbrainz.org/ws/2/area/{area_id}?inc=area-rels&fmt=json")
        codes = data.get("iso-3166-1-codes") or []
        if codes:
            code = codes[0]
            break
        area_id = next((r["area"]["id"] for r in data.get("relations") or []
                        if r.get("type") == "part of" and r.get("direction") == "backward" and r.get("area")), None)
    for a in chain:
        areas[a] = code
    return clean(code)


def country_of(candidate, areas):
    code = clean(candidate.get("country"))
    if code:
        return code
    for key in ("area", "begin-area"):
        area = candidate.get(key) or {}
        codes = area.get("iso-3166-1-codes") or []
        code = clean(codes[0]) if codes else area_country(area.get("id"), areas)
        if code:
            return code
    return ""


def lookup(name, areas):
    query = urllib.parse.quote(f'artist:"{name}"')
    url = f"https://musicbrainz.org/ws/2/artist/?query={query}&fmt=json&limit=5"
    for attempt in range(3):
        try:
            found = get_json(url).get("artists") or []
            matches = [c for c in found if c.get("score", 0) >= MIN_SCORE and same_artist(c, name)]
            for candidate in matches:
                code = country_of(candidate, areas)
                if code:
                    return code
            return ""
        except Exception:
            time.sleep(5 * (attempt + 1))
    return None


def load_artists():
    with open(TRACKS, encoding="utf-8", newline="") as f:
        counts = Counter(row["artist"] for row in csv.DictReader(f) if row["artist"])
    return [name for name, _ in counts.most_common()]


def load(path):
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


REGIONS = {
    "Africa": "Afrique",
    "Asia": "Asie",
    "Europe": "Europe",
    "Oceania": "Océanie",
    "Northern America": "Amérique du Nord",
    "Latin America and the Caribbean": "Amérique latine et Caraïbes",
}


def country_info(entry, code):
    if not entry:
        return {"a2": "", "name": code, "region": "Autre"}
    region = entry.get("region", "")
    if region == "Americas":
        region = entry.get("sub-region") or entry.get("intermediate-region") or region
    return {"a2": entry["alpha-2"], "name": entry["name"], "region": REGIONS.get(region, "Autre")}


def write_output(artists, cache, iso):
    a2_to_a3 = {c["alpha-2"]: c["alpha-3"] for c in iso}
    info = {c["alpha-3"]: c for c in iso}
    mapping = {}
    for name in artists:
        if name in cache:
            code = cache[name]
            mapping[name] = a2_to_a3.get(code, code) if code else ""
    used = sorted({c for c in mapping.values() if c})
    save(OUT, {
        "source": "MusicBrainz",
        "definition": "Pays d'origine de l'artiste (pays du groupe pour un groupe) tel que renseigné dans MusicBrainz. Ce n'est pas le pays d'écoute.",
        "method": f"Recherche par nom : premier résultat de score >= {MIN_SCORE}, dont le nom ou un alias correspond exactement et qui a un pays renseigné.",
        "generated": date.today().isoformat(),
        "artists_total": len(artists),
        "artists_queried": len(mapping),
        "countries": {c: country_info(info.get(c), c) for c in used},
        "artists": mapping,
    })


def main():
    iso = get_json(ISO_URL)
    artists = load_artists()
    cache = load(CACHE)
    areas = load(AREA_CACHE)
    retry = "--retry-empty" in sys.argv
    todo = [a for a in artists if a not in cache or (retry and not cache[a])]
    print(f"{len(artists)} artistes, {len(artists) - len(todo)} déjà traités, {len(todo)} restants")
    try:
        for i, name in enumerate(todo, 1):
            code = lookup(name, areas)
            if code is not None:
                cache[name] = code
            if i % SAVE_EVERY == 0:
                save(CACHE, cache)
                save(AREA_CACHE, areas)
                write_output(artists, cache, iso)
                print(f"{len(cache)}/{len(artists)}")
    except KeyboardInterrupt:
        print("Arrêt demandé, sauvegarde...")
    save(CACHE, cache)
    save(AREA_CACHE, areas)
    write_output(artists, cache, iso)
    found = sum(1 for v in cache.values() if v)
    print(f"Terminé : {len(cache)} artistes traités, {found} avec un pays")


if __name__ == "__main__":
    sys.exit(main())
