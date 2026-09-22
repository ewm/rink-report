"""
Refuses a sheet copy that holds a player's full name.

Looks at every column headed "Player" or "Goalie" (in the first three rows,
where the stats tab keeps its headings) and passes only names written as
first name plus last initial, like "Luke G." or "Rory O.". Prints where the
problem is (tab column and row count), never the names themselves, because
the job's log is public too.

Usage: python3 check-names.py <file.csv>   exits 0 when clean, 1 when not.
"""
import csv
import re
import sys

SHORT = re.compile(r"^[A-Za-z][A-Za-z'\-]* [A-Z]\.$")
HEADINGS = ("player", "goalie")


def main(path):
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        rows = list(csv.reader(f))

    columns = set()

    for row in rows[:3]:
        for j, cell in enumerate(row):
            if cell.strip().lower() in HEADINGS:
                columns.add(j)

    bad = {}

    for row in rows:
        for j in columns:
            if j >= len(row):
                continue

            cell = row[j].strip()

            if not cell or cell.lower() in HEADINGS:
                continue

            # One-word names are fine; anything with a second word must be an initial.
            if " " in cell and not SHORT.match(cell):
                bad[j] = bad.get(j, 0) + 1

    for j, count in sorted(bad.items()):
        print("column %d: %d cell(s) with more than a last initial" % (j + 1, count))

    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
