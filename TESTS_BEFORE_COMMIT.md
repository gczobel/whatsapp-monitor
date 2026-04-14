# Tests to Run Before Commit

## Unit Tests
- `npm test` - Run all tests using vitest
- `npm run test:coverage` - Run tests with coverage reporting
- `npm run test:watch` - Run tests in watch mode

## Code Quality Checks
- `npm run lint` - Run ESLint on source files
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting with Prettier

## Dependency Checks
- `npm run check:circular` - Check for circular dependencies

## Recommended Pre-commit Workflow
1. `npm run lint` - Check for code style issues
2. `npm run format:check` - Ensure code formatting is correct
3. `npm test` - Run all unit tests
4. `npm run check:circular` - Check for circular dependencies
5. `npm audit` - Check for security vulnerabilities (CRITICAL: commit `package-lock.json` after any `npm audit fix`)

This ensures code quality, proper formatting, test coverage, dependency health, and security before committing changes.

> **Note:** The pre-push hook also runs `npm audit`. If you run `npm audit fix`, always stage and commit the updated `package-lock.json` before pushing — otherwise CI will fail.