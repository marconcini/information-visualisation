"""
Enrichissement : artiste -> pays d'origine (via MusicBrainz)
-----------------------------------------------------------
Produit data/derived/countries.json pour la carte (choroplèthe).

Ce que c'est : le pays d'ORIGINE de l'artiste (là où la musique est produite),
d'après le champ `country` de MusicBrainz. Ce N'EST PAS le pays d'écoute.

Comme le catalogue a ~10 700 artistes et que MusicBrainz limite à ~1 requête/s,
on enrichit les N artistes les plus fréquents (par défaut 800), ce qui couvre
une large part des titres. La couverture exacte est écrite dans le JSON de sortie.

Lancer depuis le dossier scripts/ :
    pip install pandas
    python enrich_countries.py           # top 800 (défaut)
    python enrich_countries.py 500       # top 500

Reprise : un cache (_artist_country_cache.json) évite de re-interroger les
artistes déjà traités si on relance le script.
"""
import pandas as pd, json, time, sys, os, urllib.parse, urllib.request

RAW = "../data/derived/tracks_clean.csv"
OUT = "../data/derived/countries.json"
CACHE = "_artist_country_cache.json"
ISO_URL = "https://cdn.jsdelivr.net/gh/lukes/ISO-3166-Countries-with-Regional-Codes@master/all/all.json"
UA = "SpotifyInfoVisProjet/1.0 (projet etudiant Polytech Nice)"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 800

# --- table ISO : alpha-2 -> alpha-3 / nom (source documentée) ---
iso = json.loads(urllib.request.urlopen(
    urllib.request.Request(ISO_URL, headers={"User-Agent": UA}), timeout=30).read())
A2_TO_A3 = {c["alpha-2"]: c["alpha-3"] for c in iso}
A3_TO_NAME = {c["alpha-3"]: c["name"] for c in iso}

# --- données + artistes les plus fréquents ---
df = pd.read_csv(RAW)
top = df["artist"].value_counts().head(N).index.tolist()

cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}

def mb_country(name):
    q = urllib.parse.quote(f'artist:"{name}"')
    url = f"https://musicbrainz.org/ws/2/artist/?query={q}&fmt=json&limit=1"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            a = (json.loads(r.read()).get("artists") or [None])[0]
        if not a:
            return ""
        if a.get("country"):
            return a["country"]
        codes = (a.get("area") or {}).get("iso-3166-1-codes") or []
        return codes[0] if codes else ""
    except Exception:
        return None  # erreur réseau -> on réessaiera

done = 0
for name in top:
    if name in cache:
        continue
    c = mb_country(name)
    if c is None:
        time.sleep(2); c = mb_country(name) or ""
    cache[name] = c
    done += 1
    if done % 25 == 0:
        json.dump(cache, open(CACHE, "w"))
        print(f"  {done} nouveaux / {len(top)} ... (dernier : {name} -> {c})", flush=True)
    time.sleep(1.1)  # respect de la limite MusicBrainz (~1 req/s)
json.dump(cache, open(CACHE, "w"))

# --- agrégation par pays (sur les titres des artistes enrichis) ---
sub = df[df["artist"].isin(top)].copy()
sub["a2"] = sub["artist"].map(cache)
sub = sub[sub["a2"].astype(bool)]
sub["a3"] = sub["a2"].map(A2_TO_A3)
sub = sub[sub["a3"].notna()]

by = (sub.groupby("a3")
        .agg(tracks=("track_id", "size"), artists=("artist", "nunique"),
             avg_popularity=("popularity", "mean"))
        .reset_index())
by["name"] = by["a3"].map(A3_TO_NAME)
by["avg_popularity"] = by["avg_popularity"].round(1)
by = by.sort_values("tracks", ascending=False)

out = {
    "method": "artiste -> pays via MusicBrainz (champ 'country' de l'artiste/du groupe)",
    "definition": "Pays d'ORIGINE de l'artiste (pays du groupe pour un groupe). PAS le pays d'ecoute. "
                  "La popularite est le score global Spotify du titre, pas sa popularite dans ce pays.",
    "coverage": {
        "artists_enriched": int(sum(1 for v in cache.values() if v)),
        "artists_queried": len(top),
        "tracks_covered": int(len(sub)),
        "tracks_total": int(len(df)),
        "pct_tracks": round(100 * len(sub) / len(df), 1),
    },
    "by_country": by[["a3", "name", "tracks", "artists", "avg_popularity"]]
                    .rename(columns={"a3": "code"}).to_dict(orient="records"),
}
json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)
print("\nFini.", out["coverage"])
