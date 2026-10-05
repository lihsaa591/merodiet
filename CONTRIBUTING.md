# Contributing to MeroDiet

## Setup

```bash
composer install
npm install
```

## Before opening a PR

```bash
composer run phpcs      # WPCS
composer run phpstan    # static analysis
composer run test       # PHPUnit (Brain Monkey, no WP install needed)
npm run lint:js
npm run build
```

CI runs all of the above, plus a PHP 8.1/8.2/8.3 test matrix. A PR that doesn't pass locally won't pass in CI either.

## Scope discipline

MeroDiet is a practice-management product, not a framework — see the plan's non-goals before adding scheduling, billing, clinical charting, or anything else outside the meal-plan/log/compliance loop.

## Commit style

Imperative mood, present tense: `Add rollback support to Migrator`, not `Added` or `Adding`. Reference the issue number when one exists.

## Code of conduct

Be direct, be kind, assume good faith. Disagree about the code, not the person.
