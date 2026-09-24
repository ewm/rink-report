"""
Lists what changed between two copies of one sheet tab, in plain words.

The snapshot job calls this right before it replaces a saved copy, so the
old file is the last copy and the new file is what Google has now. Output is
Markdown: one line per changed row, added row or removed row, each naming
the row number as Google Sheets shows it.

Rows are matched with difflib, so a row typed into the middle of a tab shows
up as one added row instead of every row below it changing. A row that only
moved (same cells, new spot, like after a sort) is counted, not listed.

Usage: python3 sheet-changes.py <old.csv> <new.csv> <tab name>
Prints nothing when the two copies hold the same cells. A missing old file
counts as the first copy.
"""
import csv
import difflib
import sys
from collections import Counter

# The header row is the first row near the top holding one of these cells.
ANCHORS = {"date", "field", "rink name", "team name", "sponsor", "player", "no"}

# Columns that name a row in the report, in the order they are shown.
# A column is only used when its heading appears once in the header row.
LABELS = ("date", "field", "rink name", "team name", "sponsor", "away team", "home team")

# Past this many lines a tab's list is cut short (a rebuilt sheet, say).
MAX_LINES = 150

# How many cells of an added or removed row are spelled out.
MAX_CELLS = 8


def read(path):
    """
    Reads a CSV into rows of stripped cells, trailing blanks dropped.

    @param path  the CSV file; a missing file reads as no rows
    @returns     list of tuples, one per row
    """
    try:
        with open(path, newline="", encoding="utf-8", errors="replace") as f:
            rows = list(csv.reader(f))
    except FileNotFoundError:
        return []

    trimmed = []

    for row in rows:
        cells = [c.strip() for c in row]

        while cells and not cells[-1]:
            cells.pop()

        trimmed.append(tuple(cells))

    return trimmed


def find_header(rows):
    """
    Finds the header row: the first of the top eight rows holding an anchor
    cell, else the fullest of them.

    @param rows  the tab's rows
    @returns     row index, or None for an empty tab
    """
    top = rows[:8]

    if not top:
        return None

    for i, row in enumerate(top):
        if any(c.lower() in ANCHORS for c in row):
            return i

    return max(range(len(top)), key=lambda i: sum(1 for c in top[i] if c))


def column_letter(j):
    """
    Turns a 0-based column index into a sheet column letter (0 → A, 26 → AA).

    @param j  column index
    @returns  the letter(s)
    """
    letters = ""
    j += 1

    while j:
        j, r = divmod(j - 1, 26)
        letters = chr(65 + r) + letters

    return letters


def column_names(rows, h, width):
    """
    Names every column by its heading. When headings repeat (the stats tab
    has four "Date" columns), each is prefixed with its block's title from
    the row above, so each Player column says which block it is in.

    @param rows   the tab's rows
    @param h      header row index, or None
    @param width  how many columns to name
    @returns      list of names
    """
    header = rows[h] if h is not None else ()
    titles = rows[h - 1] if h else ()
    repeats = {n.lower() for n, k in Counter(c.lower() for c in header if c).items() if k > 1}
    names = []
    title = ""

    for j in range(width):
        cell = header[j] if j < len(header) else ""

        if j < len(titles) and titles[j]:
            title = titles[j].split("(")[0].strip()

        if not cell:
            names.append("column " + column_letter(j))
        elif cell.lower() in repeats and title:
            names.append(title + ": " + cell)
        else:
            names.append(cell)

    return names


def label_columns(rows, h):
    """
    Picks the columns that name a row (Date, Away team, Home team on the
    schedule; Field on settings), skipping any heading that repeats.

    @param rows  the tab's rows
    @param h     header row index, or None
    @returns     list of column indexes
    """
    if h is None:
        return []

    header = [c.lower() for c in rows[h]]
    counts = Counter(header)

    return [header.index(name) for name in LABELS if counts.get(name) == 1]


def show(value):
    """Quotes a cell for the report, or says blank."""
    return '"%s"' % value if value else "blank"


def cell(row, j):
    """Returns a row's cell, blank past its end."""
    return row[j] if j < len(row) else ""


def row_label(row, labels, h, index):
    """
    Names a row by its label cells, like "(2026-09-19, Cazenovia Chiefs,
    Niagara Jr. Cataracts)". Rows at or above the header get no label.

    @returns  the label in parentheses with a leading space, or ""
    """
    if h is None or index <= h:
        return ""

    parts = [cell(row, j) for j in labels if cell(row, j)]

    return " (%s)" % ", ".join(parts) if parts else ""


def same_cells(a, b):
    """Counts non-blank cells two rows share in the same columns."""
    return sum(1 for j in range(min(len(a), len(b))) if a[j] and a[j] == b[j])


def pair_rows(old, new, i1, i2, j1, j2):
    """
    Pairs the old and new rows of one replaced stretch. When the stretch is
    the same length on both sides, rows pair by position unless a full row
    (three or more cells) shares nothing with its partner. Otherwise a new
    row pairs with the old row it shares the most cells with, when that is
    at least half of its filled cells. Anything left over is an added or
    removed row.

    @returns  (changed [(old i, new j)], added [new j], removed [old i])
    """
    left = list(range(i1, i2))
    changed, added = [], []

    if i2 - i1 == j2 - j1:
        for i, j in zip(range(i1, i2), range(j1, j2)):
            filled = sum(1 for c in new[j] if c)

            if same_cells(old[i], new[j]) or filled < 3:
                changed.append((i, j))
                left.remove(i)
            else:
                added.append(j)

        return changed, added, left

    for j in range(j1, j2):
        filled = sum(1 for c in new[j] if c)
        best = max(left, key=lambda i: same_cells(old[i], new[j]), default=None)

        if best is not None and filled and same_cells(old[best], new[j]) * 2 >= filled:
            changed.append((best, j))
            left.remove(best)
        else:
            added.append(j)

    return changed, added, left


def names_for(index, h, names):
    """
    Column names for one row. Rows at or above the header (titles, the
    schedule's "All rows look good" line) get plain column letters, since
    the headings below them do not describe them.
    """
    if h is None or index > h:
        return names

    return ["column " + column_letter(j) for j in range(len(names))]


def describe(old_row, new_row, names):
    """Spells out each cell that differs, like 'Event was blank, now "tttt"'."""
    width = max(len(old_row), len(new_row))
    parts = []

    for j in range(width):
        o, n = cell(old_row, j), cell(new_row, j)

        if o != n:
            parts.append("%s was %s, now %s" % (names[j], show(o), show(n)))

    return "; ".join(parts)


def contents(row, names):
    """Spells out a whole row's filled cells, cut to MAX_CELLS."""
    filled = ["%s %s" % (names[j], show(c)) for j, c in enumerate(row) if c]

    if not filled:
        return "a blank row"

    more = len(filled) - MAX_CELLS
    text = "; ".join(filled[:MAX_CELLS])

    return text + ("; and %d more" % more if more > 0 else "")


def main(old_path, new_path, tab):
    old, new = read(old_path), read(new_path)

    if old == new:
        return 0

    print("### %s\n" % tab)

    if not old:
        print("- First copy saved (%d rows).\n" % len(new))
        return 0

    width = max([len(r) for r in old + new] + [0])
    h_new, h_old = find_header(new), find_header(old)
    names = column_names(new, h_new, width)
    labels_new, labels_old = label_columns(new, h_new), label_columns(old, h_old)

    changed, added, removed = [], [], []
    matcher = difflib.SequenceMatcher(None, old, new, autojunk=False)

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue

        c, a, r = pair_rows(old, new, i1, i2, j1, j2)
        changed += c
        added += a
        removed += r

    # A row removed in one place and added unchanged in another only moved.
    gone = Counter(old[i] for i in removed)
    moved = 0
    still_added = []

    for j in added:
        if gone[new[j]] > 0:
            gone[new[j]] -= 1
            moved += 1
        else:
            still_added.append(j)

    still_removed = []

    for i in removed:
        if gone[old[i]] > 0:
            gone[old[i]] -= 1
            still_removed.append(i)

    lines = []

    for i, j in changed:
        text = "Row %d%s: %s" % (j + 1, row_label(new[j], labels_new, h_new, j), describe(old[i], new[j], names_for(j, h_new, names)))
        lines.append((j, text))

    for j in still_added:
        text = "Row %d added%s: %s" % (j + 1, row_label(new[j], labels_new, h_new, j), contents(new[j], names_for(j, h_new, names)))
        lines.append((j, text))

    for i in still_removed:
        text = "Old row %d removed%s: %s" % (i + 1, row_label(old[i], labels_old, h_old, i), contents(old[i], names_for(i, h_old, names)))
        lines.append((i, text))

    lines.sort(key=lambda pair: pair[0])

    for _, text in lines[:MAX_LINES]:
        print("- " + text)

    if len(lines) > MAX_LINES:
        print("- ...and %d more changes. Compare the two copies on GitHub for the rest." % (len(lines) - MAX_LINES))

    if moved:
        rows = "1 row" if moved == 1 else "%d rows" % moved
        print("- %s moved with nothing in them changed (a sort, most likely)." % rows)

    print()

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2], sys.argv[3]))
