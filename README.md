# AWS Extensions for Visual Studio Code

[![Coverage](https://img.shields.io/codecov/c/github/aws/amazon-q-vscode/master.svg)](https://codecov.io/gh/aws/amazon-q-vscode/branch/main)

This project is open source. We encourage issues, feature requests, code reviews, pull requests or
any positive contribution. See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

### Amazon Q

[![Marketplace Version](https://img.shields.io/vscode-marketplace/v/AmazonWebServices.amazon-q-vscode.svg) ![Marketplace Downloads](https://img.shields.io/vscode-marketplace/d/AmazonWebServices.amazon-q-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=AmazonWebServices.amazon-q-vscode)

Amazon Q for VS Code is a [VS Code extension](https://marketplace.visualstudio.com/items?itemName=AmazonWebServices.amazon-q-vscode) for connecting your IDE to [Amazon Q](https://aws.amazon.com/q/developer/) and leveraging generative AI to accelerate your software development.

-   Code faster with inline code suggestions as you type
-   Chat with [Amazon Q](https://aws.amazon.com/q/developer/) to generate code, explain code, and get answers to questions about software development
-   Analyze and fix security vulnerabilities in your project
-   Upgrade your Java applications

[Project Directory](https://github.com/aws/amazon-q-vscode/tree/master/packages/amazonq)

## Documentation

-   Quick Start Guides for...
    -   [Amazon Q](https://marketplace.visualstudio.com/itemdetails?itemName=AmazonWebServices.amazon-q-vscode)
-   [FAQ / Troubleshooting](./docs/faq-credentials.md)
-   [User Guide](https://docs.aws.amazon.com/console/toolkit-for-vscode/welcome)
-   General info about [AWS SDKs and Tools](https://docs.aws.amazon.com/sdkref/latest/guide/overview.html)

## Feedback

We want your feedback!

-   Upvote 👍 [feature requests](https://github.com/aws/amazon-q-vscode/issues?q=is%3Aissue+is%3Aopen+label%3Afeature-request+sort%3Areactions-%2B1-desc)
-   [Ask a question](https://github.com/aws/amazon-q-vscode/issues/new?labels=guidance&template=guidance_request.md)
-   [Request a new feature](https://github.com/aws/amazon-q-vscode/issues/new?labels=feature-request&template=feature_request.md)
-   [File an issue](https://github.com/aws/amazon-q-vscode/issues/new?labels=bug&template=bug_report.md)
-   Or [send a pull request](CONTRIBUTING.md)!

## License Scanning

To generate license reports and attribution documents for third-party dependencies:

```bash
npm run scan-licenses

# Or run directly
./scripts/scan-licenses.sh
```

This generates:

-   `LICENSE-THIRD-PARTY` - Attribution document for distribution
-   `licenses-full.json` - Complete license data

## License

This project and the subprojects within **(Amazon Q for Visual Studio Code)** is distributed under the [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0).
