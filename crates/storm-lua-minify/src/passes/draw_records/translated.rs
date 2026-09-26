//! Repeated drawing tiles with exact per-argument integer translations.
//! The template is encoded once by the normal record codec. A shared outer
//! replay loop adds the proven translation without changing command order.
use super::*;

const MAX_TILE: usize = 48;
const MAX_KINDS: usize = 4;

#[derive(Clone)]
struct Kind {
    deltas: Vec<i64>,
}
#[derive(Clone)]
struct Tile {
    stop: usize,
    width: usize,
    count: usize,
    kinds: Vec<Kind>,
    slots: Vec<usize>,
}

fn delta(a: &Atom, b: &Atom) -> Option<i64> {
    if a == b {
        return Some(0);
    }
    let (a, b) = (a.integer()?, b.integer()?);
    if !(-1_000_000_000..=1_000_000_000).contains(&a)
        || !(-1_000_000_000..=1_000_000_000).contains(&b)
    {
        return None;
    }
    b.checked_sub(a)
}
fn matches_row(calls: &[Call], tile: &Tile, row: usize) -> bool {
    (0..tile.width).all(|slot| {
        let (a, b) = (&calls[slot], &calls[row * tile.width + slot]);
        a.key == b.key
            && a.args.len() == b.args.len()
            && a.args
                .iter()
                .zip(&b.args)
                .zip(&tile.kinds[tile.slots[slot]].deltas)
                .all(|((a, b), &d)| {
                    if d == 0 {
                        a == b
                    } else {
                        delta(a, b) == d.checked_mul(row as i64)
                    }
                })
    })
}
fn find(calls: &[Call], width: usize) -> Option<Tile> {
    if calls.len() < 2 * width {
        return None;
    }
    let mut keys = Vec::new();
    let mut kinds = Vec::<Kind>::new();
    let mut slots = Vec::new();
    for slot in 0..width {
        let (a, b) = (&calls[slot], &calls[width + slot]);
        if a.key != b.key || a.args.len() != b.args.len() {
            return None;
        }
        let deltas = a
            .args
            .iter()
            .zip(&b.args)
            .map(|(a, b)| delta(a, b))
            .collect::<Option<Vec<_>>>()?;
        let key = (&a.key, a.args.len());
        let kind = if let Some(i) = keys.iter().position(|k| *k == key) {
            if kinds[i].deltas != deltas {
                return None;
            }
            i
        } else {
            if kinds.len() == MAX_KINDS {
                return None;
            }
            keys.push(key);
            kinds.push(Kind { deltas });
            kinds.len() - 1
        };
        slots.push(kind);
    }
    // Exact, untranslated motifs are handled by the established outliner.
    if kinds.iter().all(|k| k.deltas.iter().all(|&d| d == 0)) {
        return None;
    }
    let mut tile = Tile {
        stop: 2 * width,
        width,
        count: 2,
        kinds,
        slots,
    };
    while (tile.count + 1) * width <= calls.len()
        && tile.count < 64
        && matches_row(calls, &tile, tile.count)
    {
        tile.count += 1;
        tile.stop += width;
    }
    Some(tile)
}

pub(super) fn proposals(calls: &[Call], dense: bool) -> Vec<(usize, Shape, Vec<NodeId>, Payload)> {
    let mut out = Vec::new();
    for width in 4..=MAX_TILE.min(calls.len() / 2) {
        let Some(tile) = find(calls, width) else {
            continue;
        };
        for period in 1..=MAX_PERIOD.min(width / 2) {
            if width % period != 0
                || !(period..width).all(|i| {
                    calls[i].key == calls[i % period].key
                        && calls[i].args.len() == calls[i % period].args.len()
                })
            {
                continue;
            }
            for (mut shape, targets, payload) in
                super::proposals(calls, period, width / period, true, dense)
            {
                shape.repeats = tile.count;
                shape.translations = (0..period)
                    .map(|slot| tile.kinds[tile.slots[slot]].deltas.clone())
                    .collect();
                out.push((tile.stop, shape, targets, payload));
            }
        }
    }
    out
}
