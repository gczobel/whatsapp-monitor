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

This ensures code quality, proper formatting, test coverage, and dependency health before committing changes.