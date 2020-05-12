# Contributing Guidelines

Thank you for your interest in contributing to our project. Whether it's a bug report, new feature, correction, or additional 
documentation, we greatly value feedback and contributions from our community.

Please read through this document before submitting any issues or pull requests to ensure we have all the necessary 
information to effectively respond to your bug report or contribution.


## Reporting Bugs/Feature Requests

We welcome you to use the GitHub issue tracker to report bugs or suggest features.

When filing an issue, please check [existing open](https://github.com/aws/aws-toolkit-jetbrains/issues), or [recently closed](https://github.com/aws/aws-toolkit-jetbrains/issues?utf8=%E2%9C%93&q=is%3Aissue%20is%3Aclosed%20), issues to make sure somebody else hasn't already 
reported the issue. Please try to include as much information as you can. Details like these are incredibly useful:

* A reproducible test case or series of steps
* The version of the plugin being used, which JetBrains IDE being used (and version)
* Anything unusual about your environment (e.g. recently installed plugins etc.)

## Building From Source

### Requirements

* [Java 11](https://docs.aws.amazon.com/corretto/latest/corretto-11-ug/downloads-list.html)
* [Git](https://git-scm.com/)
* Dotnet Framework (Windows) or Mono (Linux, macOS)
  * macOS steps:
    ```
    brew install mono
    brew cask install dotnet-sdk
    ```
  * Note: You can skip this if you do not want to build Rider support by adding `-PskipRider` to any Gradle command.

### Instructions

1. Clone the github repository and run `./gradlew buildPlugin` <br/> (This will produce a plugin zip under `build/distributions`)
2. In your JetBrains IDE (e.g. IntelliJ) navigate to the `Plugins` preferences and select "Install Plugin from Disk...", navigate to the zip file produced in step 1. 
4. You will be prompted to restart your IDE.

## Contributing via Pull Requests

Contributions via pull requests are much appreciated. Before sending us a pull request, please ensure that:

1. You are working against the latest source on the *master* branch.
2. You check existing open, and recently merged, pull requests to make sure someone else hasn't addressed the problem already.
3. You open an issue to discuss any significant work - we would hate for your time to be wasted.

To send us a pull request, please:

1. Fork the repository
2. Modify the source; please focus on the specific change you are contributing. *(note: all changes must have associated automated tests)*
3. Ensure local tests pass by running:
   ```
   ./gradlew check
   ```

4. Generate a change log entry for your change using 
   ```
   ./gradlew newChange --console plain
   ```

   and following the prompts. Change log entries should describe the change
   succinctly and may include Git-Flavored Markdown ([GFM](https://github.github.com/gfm/)). Reference the Github Issue # if relevant.
5. Commit to your fork using clear commit messages. Again, reference the Issue # if relevant.
6. Send us a pull request by completing the pull-request template.
7. Pay attention to any automated build failures reported in the pull request.
8. Stay involved in the conversation.

GitHub provides additional documentation on [forking a repository](https://help.github.com/articles/fork-a-repo/) and 
[creating a pull request](https://help.github.com/articles/creating-a-pull-request/).

## Debugging/Running Locally

To test your changes locally, you can run the project from IntelliJ or gradle.

- **Simple approach:** from the top-level of the repository, run:
  ```
  ./gradlew runIde --info
  ```
  The `runIde` task automatically downloads the correct version of IntelliJ
  Community Edition, builds and installs the plugin, and starts a _new_
  instance of IntelliJ with the built extension.
- To run **Rider or "Ultimate"**, specify the respective gradle target:
  ```
  ./gradlew jetbrains-ultimate:runIde
  ./gradlew jetbrains-rider:runIde
  ```
  - These targets download the required IDE for testing.
  - Do not specify `ALTERNATIVE_IDE`.
- To run the plugin in a **specific JetBrains IDE** (and you have it installed), specify the `ALTERNATIVE_IDE` environment variable:
  ```
  ALTERNATIVE_IDE=/path/to/ide ./gradlew :runIde
  ```
  - This is needed to run PyCharm and WebStorm.
  - Notice that the top-level `:runIde` target is always used with `ALTERNATIVE_IDE`.
  - See also `alternativeIdePath` in the Gradle IntelliJ Plugin [documentation](https://github.com/JetBrains/gradle-intellij-plugin).
- To run **integration tests**:
  ```
  ./gradlew integrationTest
  ```
  - Requires valid AWS credentials (take care: it will respect any credentials currently defined in your environmental variables, and fallback to your default AWS profile otherwise).
  - Requires `sam` CLI to be on your `$PATH`.
- To run **GUI tests**:
  ```
  ./gradlew guiTest
  ```
  - To debug GUI tests,
    1. Set `runIde.debugOptions.enabled=true` in the gradle file.
    2. When prompted, attach your (IntelliJ) debugger to port 5005.

### Logging

- Log messages (`LOG.info`, `LOG.error()`, …) by default are written to:
  ```
  jetbrains-core/build/idea-sandbox/system/log/idea.log
  jetbrains-core/build/idea-sandbox/system-test/logs/idea.log  # Tests
  ```
- DEBUG-level log messages are skipped by default. To enable them, add the
  following line to the _Help_ \> _Debug Log Settings_ dialog in the IDE
  instance started by the `runIde` task:
  ```
  software.aws.toolkits
  ```


## Guidelines

- AWS Explorer should not have "dependencies" (such as `sam` or `cloud-debug`). It should work without needing to install extra stuff.
- Dependencies (such as `sam` or `cloud-debug`) should fetch/install lazily, when the user interacts with a feature that requires them.

## Finding contributions to work on

Looking at the existing issues is a great way to find something to contribute on. Any of the [help wanted](https://github.com/aws/aws-toolkit-jetbrains/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) issues is a great place to start.


## Code of Conduct

This project has adopted the [Amazon Open Source Code of Conduct](https://aws.github.io/code-of-conduct). 
For more information see the [Code of Conduct FAQ](https://aws.github.io/code-of-conduct-faq) or contact 
[opensource-codeofconduct@amazon.com](mailto:opensource-codeofconduct@amazon.com) with any additional questions or comments.


## Licensing

See the [LICENSE](LICENSE) file for our project's licensing. We will ask you confirm the licensing of your contribution.

We may ask you to sign a [Contributor License Agreement (CLA)](http://en.wikipedia.org/wiki/Contributor_License_Agreement) for larger changes.
