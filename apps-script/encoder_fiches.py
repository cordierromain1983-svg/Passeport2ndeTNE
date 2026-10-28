#!/usr/bin/env python3
"""Remet les fiches en ligne (fiches_source.json) dans un site, camouflées, et régénère Corrige.gs.
Usage : encoder_fiches.py fiches_source.json index.html [Corrige.gs]"""
import base64, json, re, sys, unicodedata, copy
CLE = "Passeport-Competences-2026"
src_json, page = sys.argv[1], sys.argv[2]
SOURCE = json.load(open(src_json, encoding="utf-8"))
def norm(t):
    t = unicodedata.normalize("NFD", str(t).lower().replace("’", "'"))
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def revele(texte, it):
    """Vrai si le texte contient (ou permet de recopier) une réponse attendue."""
    n = norm(texte)
    if not n:
        return True
    for w in it["w"]:
        for a in w.get("ok", []) + w.get("v", []):
            na = norm(a)
            if na in ("correct", "incorrect"):
                continue
            if len(na) >= 2 and re.search(r"\b" + re.escape(na) + r"\b", n):
                return True
        if w["k"] in "xa" and w.get("re"):
            try:
                if re.search(w["re"], n, re.I):
                    return True
            except re.error:
                return True
    return False


def indice(it):
    """Indice propre à la question, seulement s'il ne donne pas la réponse."""
    candidats = []
    if it.get("ex"):
        candidats.append(it["ex"])
    m = re.search(r"\(([^()]{6,})\)\s*$", it.get("show", ""))
    symbole = any(not norm(x) for w in it["w"] for x in w.get("ok", []) + w.get("v", []))
    # une parenthèse courte (« préposition », « il / elle / on ») nomme souvent la réponse : on l'écarte
    if m and not symbole and len(norm(m.group(1)).split()) >= 4 and not m.group(1).lower().startswith("ou "):
        candidats.append(m.group(1)[0].upper() + m.group(1)[1:])
    # formulations qui reviennent à donner la réponse (exemple corrigé, nombre attendu, nature du mot…)
    trahit = re.compile(r" - |accepter|il y a \d|orthographi|seul mot|^pr[ée]position|^(pass[ée] compos[ée]|plus-que-parfait|futur|imparfait)\s*:", re.I)
    for c in candidats:
        c = c.strip()
        if not revele(c, it) and not trahit.search(c):
            return c if c.endswith((".", "!", "?")) else c + "."
    return ""



FI = copy.deepcopy(SOURCE)
for f in FI.values():
    for e in f["ex"]:
        for it in e["items"]:
            it["hint"] = indice(it)
            it["why"] = it.get("ex", "") if it.get("ex") and not revele(it["ex"], it) else ""
            it.pop("show", None); it.pop("ex", None)
brut = json.dumps(FI, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
cle = CLE.encode()
code = base64.b64encode(bytes(b ^ cle[i % len(cle)] for i, b in enumerate(brut))).decode()
s = open(page, encoding="utf-8").read()
m = re.search(r'const FI=\(\(\)=>\{const k=.*?\}\)\(\)', s)
assert m, "bloc des fiches introuvable"
nouveau = ('const FI=(()=>{const k=' + json.dumps(CLE) + ',b=atob(' + json.dumps(code) + '),u=new Uint8Array(b.length);'
           'for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i)^k.charCodeAt(i%k.length);'
           'return JSON.parse(new TextDecoder().decode(u))})()')
s = s[:m.start()] + nouveau + s[m.end():]
open(page, "w", encoding="utf-8").write(s)
print(page, ":", len(FI), "fiches en ligne")
if len(sys.argv) > 3:
    C = {}
    for k, f in SOURCE.items():
        C[k] = {"nom": f["name"], "ai": f["ai"], "items": {str(it["n"]): {"cond": bool(it["cond"]), "w": [{kk: w[kk] for kk in ("k", "ok", "re", "v") if kk in w} for w in it["w"]]}
                                                             for e in f["ex"] for it in e["items"]}}
    open(sys.argv[3], "w", encoding="utf-8").write(
        "// Corrigé des fiches en ligne (identique pour la 2de et la 1re).\n"
        "// Sert à recorriger les réponses envoyées par les élèves : impossible de tricher en envoyant une fausse note.\n"
        "const CORRIGE = " + json.dumps(C, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(sys.argv[3], ":", len(C), "fiches dans le corrigé du tableur")
