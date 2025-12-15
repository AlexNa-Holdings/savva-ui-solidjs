# Contributing to SAVVA Platform

Thank you for your interest in contributing to SAVVA! This document provides guidelines for contributing to the project.

## Code of Conduct

- Be respectful and constructive
- Welcome newcomers and help them get started
- Focus on what is best for the community
- Show empathy towards other community members

## How to Contribute

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include:

- Clear, descriptive title
- Steps to reproduce the issue
- Expected vs actual behavior
- Screenshots if applicable
- Your environment (browser, OS, wallet, etc.)

### Suggesting Features

Feature suggestions are welcome! Please:

- Use a clear, descriptive title
- Provide detailed explanation of the feature
- Explain why this feature would be useful
- Include mockups or examples if possible

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Follow the code style** - we use the existing codebase as reference
3. **Write clear commit messages** - use present tense ("Add feature" not "Added feature")
4. **Update documentation** if you're changing functionality
5. **Test your changes** thoroughly before submitting

#### Pull Request Process

1. Ensure your code builds without errors: `npm run build`
2. Update the README.md or relevant documentation
3. Follow the existing code style and patterns
4. Write meaningful commit messages
5. Create a Pull Request with a clear title and description

## Development Setup

```bash
# Clone your fork
git clone https://github.com/your-username/savva-ui-solidjs.git
cd savva-ui-solidjs

# Add upstream remote
git remote add upstream https://github.com/original-org/savva-ui-solidjs.git

# Install dependencies
npm install

# Create a feature branch
git checkout -b feature/your-feature-name

# Start development server
npm run dev
```

## Coding Guidelines

### General Principles

- **Keep it simple** - avoid over-engineering
- **Be consistent** - follow existing patterns in the codebase
- **Comment complex logic** - help others understand your code
- **Use meaningful names** - variables, functions, and components should be self-explanatory

### Code Style

- Use **SolidJS** patterns and best practices
- Follow existing component structure
- Use **functional components** with hooks
- Keep components focused and single-purpose
- Use **TypeScript/JSDoc** for type safety where applicable

### Component Guidelines

```javascript
// Good example
export default function MyComponent(props) {
  const [state, setState] = createSignal(initialValue);

  // Clear, descriptive function names
  function handleClick() {
    // Implementation
  }

  return (
    <div>
      {/* JSX */}
    </div>
  );
}
```

### File Organization

- Place new components in appropriate directories under `src/x/`
- Keep related files together
- Use clear, descriptive file names
- Follow existing naming conventions

## Testing

- Test your changes manually in the browser
- Check both light and dark themes
- Test with different wallet connections
- Verify mobile responsiveness

## Internationalization (i18n)

When adding new UI text:

1. Add translations to all language files in `src/i18n/`
2. Use the `t()` function from `useApp()` context
3. Keep keys descriptive and organized
4. Run `npm run i18n` to update language files

Example:
```javascript
const { t } = useApp();
<button>{t("common.save")}</button>
```

## Smart Contract Integration

When working with blockchain features:

- Use existing contract helper functions from `src/blockchain/`
- Follow the established pattern for contract interactions
- Handle loading and error states properly
- Test with PulseChain testnet first

## License Compliance

**Important**: This project is licensed under GPL-3.0 with SAVVA Additional Terms. Any contributions must:

- Comply with the GPL-3.0 license
- Use only official SAVVA blockchain contracts
- Not introduce alternative tokens
- Not modify or replace official SAVVA contracts

By contributing, you agree that your contributions will be licensed under the same license.

## Questions?

- Check the [Developer Docs](public/dev_docs/en/)
- Ask in GitHub Discussions
- Join the community at https://savva.app

Thank you for contributing to SAVVA!
