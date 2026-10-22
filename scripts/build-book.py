"""Build the offline book from audited PDF rows, original examples and ECDICT.

Usage: python scripts/build-book.py /absolute/path/to/ecdict.csv
The downloaded dictionary stays outside the project; only used entries ship.
"""
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOKEN = re.compile(r"[A-Za-z]+(?:['-][A-Za-z]+)*")

def read(name):
    return json.loads((ROOT / name).read_text())

def write(name, data):
    (ROOT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

base = read('source/book-base.json')
legacy = read('source/legacy-data.json')
overrides = read('source/dictionary-overrides.json')
drafts = sum((read(f'content/batch-{i}.json') for i in (1, 2, 3)), [])
by_id = {r['id']: r for r in drafts}
assert len(by_id) == 506 and set(by_id) == {r['id'] for r in base if r['id'] > 20}
for row in base[20:]:
    assert by_id[row['id']]['word'] == row['word'], row

cards = []
for row in base:
    draft = next((c for c in legacy['cards'] if c['id'] == row['id']), None) if row['id'] <= 20 else by_id[row['id']]
    c = {**row, **draft}
    c['example'] = c['example'].replace('’', "'").replace('–', '-')
    c['translation'] = c['translation'].strip()
    if c.get('distractorWords'):
        c['distractorWords'] = [w.lower() for w in c['distractorWords']]
    assert all(c.get(k) for k in ('meaning', 'example', 'translation', 'note')), c['word']
    assert len(TOKEN.findall(c['example'])) <= 20, (c['word'], c['example'])
    c['spellings'] = c.get('spellings', [c['word']])
    cards.append(c)

card_by_word = {c['word']: c for c in cards}
ALIASES = {
    'analyze': ['analyse'], 'emphasize': ['emphasise'], 'minimize': ['minimise'],
    'co-operation': ['cooperation'], 'co-ordinate': ['coordinate'],
    'encyclopaedia': ['encyclopedia'], 'fulfill': ['fulfil'], 'harbor': ['harbour'],
    'installment': ['instalment'], 'mould': ['mold'], 'odour': ['odor'],
    'paralyse': ['paralyze'], 'plagiarise': ['plagiarize'],
    'skepticism': ['scepticism'], 'organize': ['organise'],
    'harmonize': ['harmonise'], 'utilization': ['utilisation'],
    'recognize': ['recognise'], 'fertiliser': ['fertilizer'],
}
for c in cards:
    c['spellings'] = list(dict.fromkeys(c['spellings'] + ALIASES.get(c['word'], [])))

def clue_terms(c):
    # These are source association clues, not a claim of interchangeable synonyms.
    terms = c.get('redTerms', []) + re.split('[,，;；]', c.get('sourceClues', ''))
    return list(dict.fromkeys(t.strip().lower() for t in terms
        if re.fullmatch(r"[A-Za-z]+(?:[ '-][A-Za-z]+)*", t.strip()) and t.strip().lower() != c['word']))

wanted = set(legacy['glossary']) | set(card_by_word)
IRREGULAR = {'are': 'be', 'mosquitoes': 'mosquito'}
wanted.update(IRREGULAR.values())
for c in cards:
    wanted.update(t.lower() for t in TOKEN.findall(c['example']))
    wanted.update(c.get('distractorWords', []))
    wanted.update(d['word'] for d in c.get('distractors', []))
    wanted.update(clue_terms(c))
    wanted.update(c['spellings'])
    for spelling in c['spellings']:
        wanted.update(spelling.split(' '))
for word in list(wanted):
    if word.endswith("'s"):
        wanted.add(word[:-2])
    wanted.update(word.split('-'))

records, variants = {}, {}
with open(sys.argv[1], newline='') as f:
    for row in csv.DictReader(f):
        word = row['word'].lower()
        hit = word in wanted
        for item in row.get('exchange', '').split('/'):
            if ':' not in item:
                continue
            tag, values = item.split(':', 1)
            if tag in ('p', 'd', 'i', '3', 'r', 't', 's'):
                for value in values.split(','):
                    if value.lower() in wanted:
                        variants.setdefault(value.lower(), word)
                        hit = True
        if hit and (word not in records or row['word'] == word):
            records[word] = {k: row[k] for k in ('word', 'phonetic', 'translation', 'pos', 'exchange')}

write('source/dictionary-used.json', records)
POS = {'a': 'adj.', 'adj': 'adj.', 'ad': 'adv.', 'adv': 'adv.', 'n': 'n.',
       'vt': 'v.', 'vi': 'v.', 'v': 'v.', 'prep': 'prep.', 'conj': 'conj.',
       'pron': 'pron.', 'num': 'num.', 'art': 'art.', 'int': 'interj.',
       'interj': 'interj.', 'aux': 'aux. v.', 'modal': 'modal v.', 'pl': 'n.'}

def parse_senses(row):
    groups = {}
    last = None
    for line in row.get('translation', '').replace('\\n', '\n').splitlines():
        line = line.strip()
        # Keep ordinary POS senses; unrelated technical appendix lines are not POS entries.
        if re.match(r'^\[[^\]]+\]', line):
            continue
        match = re.match(r'^([a-z]+)(?:\.\s*|\s+)(.*)', line)
        if match and match[1] in POS:
            last, line = POS[match[1]], match[2]
        if not last:
            continue
        if line and re.search('[\u4e00-\u9fff]', line):
            groups.setdefault(last, []).append(line)
    return [{'pos': pos, 'meaning': '；'.join(dict.fromkeys(meanings))} for pos, meanings in groups.items()]

def card_senses(text):
    tag = r'(?:phr\. v\.|v\. phr\.|prep\. phr\.|adj\. phr\.|adv\. phr\.|prep\./adv\.|adj\.|adv\.|prep\.|conj\.|pron\.|det\.|n\.|v\.|phr\.|短语)'
    matches = list(re.finditer(r'(?:^|\s)(' + tag + r')\s*', text))
    if not matches:
        return [{'pos': 'phr.', 'meaning': text}]
    return [{'pos': m[1] if m[1] != '短语' else 'phr.',
             'meaning': text[m.end():matches[i+1].start() if i+1 < len(matches) else len(text)].strip(' ；;')}
            for i, m in enumerate(matches)]

glossary = {}
missing = set()

def entry(word, trail=()):
    if word in glossary:
        return glossary[word]
    if word in trail:
        return None
    row = records.get(word)
    lemma = word
    if row:
        for part in row.get('exchange', '').split('/'):
            if part.startswith('0:'):
                lemma = part[2:].split(',')[0].lower()
                break
    if lemma == word and word in variants and not parse_senses(row or {}):
        lemma = variants[word]
    if word in IRREGULAR:
        lemma = IRREGULAR[word]
    if word.endswith("'s") and not row:
        lemma = word[:-2]
    parent = entry(lemma, (*trail, word)) if lemma != word else None
    senses = parse_senses(row or {})
    if not senses and row and ' ' in word and word not in card_by_word and re.search('[\u4e00-\u9fff]', row.get('translation', '')):
        senses = [{'pos': 'phr.', 'meaning': row['translation'].replace('\\n', '；')}]
    if parent:
        own = senses
        senses = [dict(s) for s in parent['senses']]
        for sense in own:
            same = next((s for s in senses if s['pos'] == sense['pos']), None)
            if same and sense['meaning'] not in same['meaning']:
                same['meaning'] += '；' + sense['meaning']
            elif not same:
                senses.append(dict(sense))
    if word in overrides:
        senses = [dict(s) for s in overrides[word]]
    if word in card_by_word:
        c = card_by_word[word]
        for target in card_senses(c['meaning']):
            same = next((s for s in senses if s['pos'] == target['pos']), None)
            if same:
                if target['meaning'] not in same['meaning']:
                    same['meaning'] = target['meaning'] + '；' + same['meaning']
            else:
                senses.insert(0, target)
    if word in legacy['glossary']:
        # Preserve approved hand-edited definitions and irregular-word explanations.
        old = legacy['glossary'][word]
        if old.get('senses'):
            senses = [{**s} for s in old['senses']]
            lemma = old.get('lemma', word)
    if not senses:
        missing.add(word)
        return None
    result = {'lemma': lemma, 'meaning': '；'.join(s['pos'] + ' ' + s['meaning'] for s in senses), 'senses': senses}
    if word in legacy['glossary']:
        result = {**legacy['glossary'][word], 'senses': senses}
    glossary[word] = result
    return result

for word in wanted:
    entry(word)

for c in cards:
    if c['id'] <= 20:
        continue
    candidates = clue_terms(c)
    c['synonyms'] = [t for t in candidates if t in glossary][:5]
    if not c['synonyms'] and c.get('relatedTo'):
        main = next(x for x in cards if x['id'] == c['relatedTo'])
        c['synonyms'] = [main['word']]
    distractors = []
    for word in c['distractorWords']:
        e = entry(word)
        if not e or word == c['word']:
            missing.add(word)
            continue
        brief = '；'.join(re.split('[,，；;]', e['senses'][0]['meaning'])[:2])
        meaning = card_by_word[word]['meaning'] if word in card_by_word else e['senses'][0]['pos'] + ' ' + brief
        distractors.append({'word': word, 'meaning': meaning})
    c['distractors'] = distractors

def ipa(word):
    manual = {
        'unexpectedly': 'ˌʌnɪkˈspektɪdli', 'meteorological': 'ˌmiːtiərəˈlɒdʒɪkəl',
        'co-operation': 'kəʊˌɒpəˈreɪʃən', 'co-ordinate': 'kəʊˈɔːdɪneɪt',
        'eco-friendly': 'ˌiːkəʊ ˈfrendli', 'manage to do': 'ˈmænɪdʒ tə duː',
        'be subject to': 'bi ˈsʌbdʒekt tə', 'based on': 'beɪst ɒn',
    }
    if word in manual:
        return manual[word]
    row = records.get(word) or records.get(ALIASES.get(word, [''])[0])
    if row and row['phonetic']:
        return row['phonetic'].strip('/[] ')
    pieces = word.split(' ')
    if len(pieces) > 1:
        parts = [ipa(part) for part in pieces]
        if all(parts):
            return ' '.join(parts)
    return ''

missing_ipa = []
for c in cards:
    if not c.get('ipa'):
        sound = ipa(c['word'])
        c['ipa'] = '/' + sound + '/' if sound else ''
        if not sound:
            missing_ipa.append(c['word'])
    for key in ('sourceWord', 'sourceClues', 'redTerms', 'distractorWords', 'rank'):
        c.pop(key, None)

ordered = []
for category in (1, 2, 3):
    ordered.extend(c for c in cards if c['category'] == category and c['sourceKind'] == 'main')
    ordered.extend(c for c in cards if c['category'] == category and c['sourceKind'] == 'replacement')
for i, c in enumerate(ordered, 1):
    c['order'] = i

required = set(card_by_word) | set(legacy['glossary'])
for c in ordered:
    required.update(t.lower() for t in TOKEN.findall(c['example']))
    required.update(c['synonyms'])
    required.update(d['word'] for d in c['distractors'])
for _ in range(5):
    roots = {glossary[k]['lemma'] for k in required if k in glossary and glossary[k]['lemma'] in glossary}
    if roots.issubset(required):
        break
    required.update(roots)
uncovered = sorted(required - set(glossary))
bad_distractors = [(c['word'], c.get('distractorWords'), len(c['distractors'])) for c in ordered if len(c['distractors']) != 3]
report = {'cards': len(ordered), 'main': 376, 'coloredOccurrences': 151, 'deduplicatedOverlap': ['principle'],
          'categories': [sum(c['category'] == n for c in ordered) for n in (1, 2, 3)],
          'glossary': len(required & glossary.keys()), 'uncovered': uncovered, 'missingIPA': missing_ipa, 'badDistractors': bad_distractors}
write('source/build-audit.json', report)
print(json.dumps(report, ensure_ascii=False))
if uncovered or missing_ipa or bad_distractors:
    raise SystemExit('Content coverage needs repair; production data was not changed.')

data = {'book': {'id': 'liu-hongbo-reading-538', 'title': '雅思阅读考点词 · 刘洪波',
                 'sourceDeclaredCount': 538, 'totalCards': len(ordered), 'mainCount': 376,
                 'sourcePages': [2, 15], 'dictionary': 'ECDICT (MIT)'},
        'cards': ordered, 'glossary': {k: glossary[k] for k in sorted(required)}}
(ROOT / 'dist/data.js').write_text('window.IELTS_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('WROTE', len(ordered), 'cards and', len(data['glossary']), 'offline entries')
