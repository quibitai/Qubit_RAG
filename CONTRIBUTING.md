# Contributing to Quibit RAG

Thank you for considering contributing to Quibit RAG! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## How Can I Contribute?

### Reporting Bugs

Before submitting a bug report:
- Check the existing issues to see if the problem has already been reported
- If you're unable to find an open issue addressing the problem, open a new one

When submitting a bug report, include as much detail as possible:
- A clear and descriptive title
- Steps to reproduce the issue
- Expected behavior vs. actual behavior
- Screenshots or logs (if applicable)
- Environment details (OS, browser, etc.)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When suggesting an enhancement:
- Use a clear and descriptive title
- Provide a detailed description of the suggested enhancement
- Explain why this enhancement would be useful to most Quibit RAG users

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and ensure they pass
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

#### Pull Request Guidelines

- Follow the coding style and conventions used in the project
- Include tests for new features or bug fixes
- Update documentation as needed
- Keep pull requests focused on a single concern
- Reference any related issues in your PR description

## Development Environment Setup

1. Clone the repository:
```bash
git clone https://github.com/quibitai/Quibit_RAG.git
cd Quibit_RAG
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. Run the development server:
```bash
npm run dev
```

## Style Guide

### Code Formatting

This project uses:
- ESLint for code linting
- Prettier for code formatting

Run linting:
```bash
npm run lint
```

Format your code:
```bash
npm run format
```

### Commit Messages

- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit the first line to 72 characters or less
- Reference issues and pull requests liberally after the first line

## Testing

Run tests:
```bash
npm test
```

When adding new features, please add appropriate tests.

## Documentation

- Update documentation when changing functionality
- Use clear and consistent terminology
- Include code examples where appropriate

## Questions?

If you have any questions, please open an issue or reach out to the maintainers.

Thank you for contributing to Quibit RAG! 