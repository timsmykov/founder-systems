"""Verify the public library without the private source archive or dependencies."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
read = lambda p: json.loads(p.read_text())


def verify():
    index = read(ROOT / 'data/index.json')
    cards = {k: v for p in (ROOT / 'data/cards').glob('*.json') for k, v in read(p).items()}
    evidence = {k: v for p in (ROOT / 'data/evidence').glob('*.json') for k, v in read(p).items()}
    relations = read(ROOT / 'data/relations.json')['relations']
    assert len(cards) == index['counts']['meanings'] == 783
    assert len(evidence) == index['counts']['quotations'] == 5098
    assert len(relations) == index['counts']['comparisons'] == 249
    assert sum(len(c['original']['facets']) for c in cards.values()) == 3692
    for row in evidence.values():
        assert isinstance(row['text'], str)
        if row.get('text_sha256'):
            assert hashlib.sha256(row['text'].encode()).hexdigest() == row['text_sha256']
    for card in index['cards']:
        assert card['id'] in cards
        assert set(card['evidence_keys']) <= evidence.keys()
        for keys in cards[card['id']]['facet_evidence'].values():
            assert set(keys) <= evidence.keys()
    for relation in relations:
        for decision in relation['decisions']:
            for side in ['nik', 'elon']:
                for endpoint in decision[side]:
                    assert endpoint['idea_id'] in cards
                    assert set(endpoint['evidence_keys']) <= evidence.keys()
    assert read(ROOT / 'data/quote-search.json') == {k: v['text'] for k, v in evidence.items()}
    for relative, expected in read(ROOT / 'release-manifest.json')['files'].items():
        assert hashlib.sha256((ROOT / relative).read_bytes()).hexdigest() == expected, relative
    forbidden = {'.epub', '.sqlite', '.db', '.jsonl'}
    tracked = [p for p in ROOT.rglob('*') if p.is_file() and not any(part in {'.git', 'node_modules'} for part in p.relative_to(ROOT).parts)]
    assert not any(p.suffix in forbidden for p in tracked)
    assert not any(p.name in {'checkpoint.json', 'resume-packet.json'} for p in tracked)
    print('Verified: 783 meanings, 3692 facets, 249 comparisons and 5098 literal quotation records.')


if __name__ == '__main__':
    verify()
