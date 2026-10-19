# Finance_Engine split: runbook

Splits `src/domain/Finance_Engine.js` into focused modules under `src/domain/finance/`, leaving `Finance_Engine.js`
as a facade with the same `module.exports`. No caller changes. Behaviour is proven unchanged by a golden-master test.

## Steps (run in this order, on a clean git tree)

```bash
npm i --no-save acorn eslint-scope        # one-off tooling; does not touch package.json or the lockfile

# 1. Record today's behaviour BEFORE touching anything (on YOUR machine: date/number formatting depends on Node/ICU)
RECORD_GOLDEN=1 node --test tests/finance_characterization.test.js

# 2. Dry run: prints the plan, writes nothing. Fix the layout (MODULES in the script) if it aborts.
node scripts/refactor/split_finance_engine.js

# 3. Apply
node scripts/refactor/split_finance_engine.js --write

# 4. Prove it
node scripts/refactor/verify_finance_split.js                  # no unresolved names, every module loads alone, no cycles
node --test tests/finance_characterization.test.js             # identical results AND identical calls to the stubs
npm test
```

## What the tool refuses to do (it aborts BEFORE writing)
- leave any top-level declaration unassigned (nothing is silently dropped)
- accept unexpected top-level statements
- share a mutable `let` binding between modules
- create a circular require between modules
- emit a file with an unresolved identifier (a missing import)

## If your Finance_Engine.js has changed since this was written
- New or renamed top-level functions make the tool abort with their names: add them to the right module in `MODULES`.
- The golden test calls functions by name. A function that no longer exists is recorded as an error and compared consistently,
  but add cases for new functions before recording.

## Layout (layers only depend downward)
State -> Helpers -> Ledger -> Analytics -> Corrections -> Confirmations -> Email_Sync -> `Finance_Engine.js` (facade)
