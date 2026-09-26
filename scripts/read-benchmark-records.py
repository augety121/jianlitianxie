"""Reconstruct benchmark report JSON from lossless, readable CSV records."""
from __future__ import annotations
import argparse, csv, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
def read_report(name: str, directory: Path = ROOT / 'docs/benchmarks') -> dict:
    metadata = json.loads((directory / 'metadata.json').read_text())
    selected = metadata['reports'][name]
    report = selected['reportWithoutAttempts']
    attempts = []
    with (directory / selected['records']).open(newline='') as stream:
        for row in csv.DictReader(stream):
            item = {}
            for dotted, cell in row.items():
                if cell == '':
                    continue
                target = item
                parts = dotted.split('.')
                for part in parts[:-1]:
                    target = target.setdefault(part, {})
                target[parts[-1]] = json.loads(cell)
            attempts.append(item)
    report['attempts'] = attempts
    return report
if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('name', help='e.g. final-native, final-combobox, final-shadow')
    args = parser.parse_args()
    print(json.dumps(read_report(args.name), ensure_ascii=False, indent=2))
