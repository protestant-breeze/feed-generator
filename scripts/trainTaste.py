#!/usr/bin/env python3
"""Train a Naive Bayes taste classifier from Jack's Twitter archive.

Positive class: the 62,840 tweets he liked (ground truth for his taste).
Negative class: posts sampled live off the Bluesky firehose (generic baseline).

Keyword scoring failed to separate these (~2x lift). An n-gram model can pick up
register/voice — the thing his likes actually have in common — not just topic.

Outputs src/taste-model.json: log-odds weights the TS service loads at runtime.
"""
import json, re, math, random, sys, sqlite3
from collections import Counter

random.seed(17)
D = "/Users/jackboyle/Library/CloudStorage/GoogleDrive-jackdboyle@gmail.com/My Drive/00_LIBRARY/Personal/Twitter Files/data/"
ROOT = "/Users/jackboyle/bluesky-feed-generator/"

URL = re.compile(r'https?://\S+')
MENTION = re.compile(r'@\w+')
WORD = re.compile(r"[a-z0-9']+")

# Platform artifacts: these separate "Twitter" from "Bluesky", not "Jack's
# taste" from "not Jack's taste". Left in, the model learns the wrong thing.
ARTIFACTS = {
    'tweet', 'tweets', 'tweeting', 'tweeted', 'retweet', 'retweets', 'rt',
    'twitter', 'tl', 'timeline', 'dm', 'dms', 'subtweet', 'quote',
    'amp', 'quot', 'gt', 'lt', 'nbsp',  # HTML-entity leakage in the archive
}

def tokens(text):
    """Words + bigrams. Handles/URLs stripped: they'd be spurious features
    (his Twitter friends aren't on Bluesky)."""
    t = URL.sub(' ', text.lower())
    t = MENTION.sub(' ', t)
    ws = WORD.findall(t)
    ws = [w for w in ws if len(w) <= 20 and w not in ARTIFACTS]
    out = list(ws)
    out += [f'{a}_{b}' for a, b in zip(ws, ws[1:])]
    # crude style features
    n = len(ws)
    if n <= 8: out.append('__short__')
    elif n >= 40: out.append('__long__')
    if any(c in text for c in '😭😂💀🤣'): out.append('__laughemoji__')
    if text.count('?') >= 1: out.append('__question__')
    if re.search(r'\b[A-Z]{4,}\b', text): out.append('__caps__')
    return out

def load_likes():
    raw = open(D + 'like.js', encoding='utf-8').read()
    return [d['like']['fullText'] for d in json.loads(raw[raw.index('=') + 1:])]

def load_negatives():
    con = sqlite3.connect(ROOT + 'db.sqlite')
    rows = [r[0] for r in con.execute(
        "select text from post where text is not null and length(text)>0")]
    con.close()
    return rows

pos = load_likes()
neg = load_negatives()
print(f"positives (his likes): {len(pos)}")
print(f"negatives (firehose):  {len(neg)}")
if len(neg) < 1500:
    print("!! not enough negatives yet — let the collector run longer")
    sys.exit(1)

# balance so the prior doesn't swamp the signal
random.shuffle(pos); random.shuffle(neg)
n = min(len(pos), len(neg))
pos_s, neg_s = pos[:n], neg[:n]

def split(xs, frac=0.8):
    k = int(len(xs) * frac)
    return xs[:k], xs[k:]

ptr, pte = split(pos_s)
ntr, nte = split(neg_s)
print(f"train: {len(ptr)}+{len(ntr)}   test: {len(pte)}+{len(nte)}")

pc, nc = Counter(), Counter()
for t in ptr: pc.update(set(tokens(t)))
for t in ntr: nc.update(set(tokens(t)))

# keep tokens seen enough times to be meaningful
MIN = 3
vocab = {w for w in set(pc) | set(nc) if pc[w] + nc[w] >= MIN}
print(f"vocab: {len(vocab)}")

P, N = len(ptr), len(ntr)
A = 1.0  # laplace
weights = {}
for w in vocab:
    pp = (pc[w] + A) / (P + 2 * A)
    pn = (nc[w] + A) / (N + 2 * A)
    weights[w] = math.log(pp / pn)

def score(text):
    return sum(weights.get(w, 0.0) for w in set(tokens(text)))

# ---- evaluate on held-out data ----
ps = [score(t) for t in pte]
ns = [score(t) for t in nte]
alls = sorted(ps + ns)

def rate(th):
    return (sum(1 for s in ps if s >= th) / len(ps),
            sum(1 for s in ns if s >= th) / len(ns))

print("\nthresh | %his-likes kept | %generic kept | lift")
best = None
for th in [round(x, 1) for x in [-2, -1, 0, 1, 2, 3, 4, 5, 6, 8, 10]]:
    tp, fp = rate(th)
    lift = tp / fp if fp > 0 else float('inf')
    flag = ''
    if fp > 0 and tp >= 0.25 and (best is None or lift > best[1]):
        best, flag = (th, lift), ' <-'
    print(f"{th:6} | {tp*100:14.1f}% | {fp*100:12.1f}% | {lift:5.2f}x{flag}")

# AUC via rank statistic
import itertools
allpairs = 0
concord = 0
sample_p = random.sample(ps, min(400, len(ps)))
sample_n = random.sample(ns, min(400, len(ns)))
for a in sample_p:
    for b in sample_n:
        allpairs += 1
        if a > b: concord += 1
        elif a == b: concord += 0.5
print(f"\nAUC ≈ {concord/allpairs:.3f}  (0.5 = useless, 1.0 = perfect)")

TH = best[0] if best else 2.0
print(f"chosen threshold: {TH}")

# export only the most informative weights to keep the file small
top = sorted(weights.items(), key=lambda kv: -abs(kv[1]))[:60000]
out = {'threshold': TH, 'weights': {w: round(v, 4) for w, v in top}}
with open(ROOT + 'src/taste-model.json', 'w') as f:
    json.dump(out, f)
print(f"wrote src/taste-model.json ({len(top)} features)")

print("\n=== most 'Jack' tokens ===")
for w, v in sorted(weights.items(), key=lambda kv: -kv[1])[:25]:
    if pc[w] >= 15:
        print(f"  {v:+.2f}  {w}  (his:{pc[w]} generic:{nc[w]})")
