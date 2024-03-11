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

* [Java 17](https://docs.aws.amazon.com/corretto/latest/corretto-17-ug/downloads-list.html)
* [Git](https://git-scm.com/)
* .NET 6
  * In theory, you can use a higher version, however we build with .NET 6 in CI
  * macOS steps:
    ```
    brew install dotnet@6
    ```

### Instructions

1. Clone the github repository and run `./gradlew :intellij:buildPlugin` <br/> (This will produce a plugin zip under `intellij/build/distributions`)
2. In your JetBrains IDE (e.g. IntelliJ) navigate to the `Plugins` preferences and select "Install Plugin from Disk...", navigate to the zip file produced in step 1. 
4. You will be prompted to restart your IDE.

## Contributing via Pull Requests

Contributions via pull requests are much appreciated. Before sending us a pull request, please ensure that:

1. You are working against the latest source on the *main* branch.
2. You check existing open, and recently merged, pull requests to make sure someone else hasn't addressed the problem already.
3. You open an issue to discuss any significant work - we would hate for your time to be wasted.

To send us a pull request, please:

1. Fork the repository
2. Modify the source; please focus on the specific change you are contributing. *(note: all changes must have associated automated tests)*
3. Ensure local tests pass by running:
   ```
   ./gradlew check
   ```

4. Generate a change log entry for your change if the change is visible to users of the toolkit in their IDE.
   ```
   ./gradlew :newChange --console plain
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

To test your changes locally, you can run the project from IntelliJ or Gradle using the `runIde` tasks. Each build will download the required IDE version and 
start it in a sandbox (isolated) configuration.

### In IDE Approach (Recommended)

Launch the IDE through your IntelliJ instance using the provided run configurations. 
If ran using the Debug feature, a debugger will be auto-attached to the sandbox IDE.

### Running manually

  ```
  # IntelliJ IDEA Community
  ./gradlew :plugin-toolkit:intellij:runIde -PrunIdeVariant=IC

  # IntelliJ IDEA Ultimate
  ./gradlew :plugin-toolkit:intellij:runIde -PrunIdeVariant=IU

  # Rider
  ./gradlew :plugin-toolkit:intellij:runIde -PrunIdeVariant=RD

  # Gateway
  ./gradlew :plugin-toolkit:jetbrains-gateway:runIde
  ```
  - These targets download the required IDE for testing.

#### Alternative IDE

- To run the plugin in a **specific JetBrains IDE** (and you have it installed), specify the `ALTERNATIVE_IDE` environment variable:
  ```
  ALTERNATIVE_IDE=/path/to/ide ./gradlew :plugin-toolkit:intellij:runIde
  ```
  - This is needed to run PyCharm and WebStorm.
  - See also `alternativeIdePath` option in the `runIde` tasks provided by the Gradle IntelliJ Plugin [documentation](https://github.com/JetBrains/gradle-intellij-plugin).

## Running Tests

### Unit Tests / Checkstyle

These tests make no network calls and are safe for anyone to run.
 ```
 ./gradlew check
 ```

### Integration Tests

It is **NOT** recommended for third party contributors to run these due to they create and mutate AWS resources.

- Requires valid AWS credentials (take care: it will respect any credentials currently defined in your environmental variables, and fallback to your default AWS profile otherwise).
- Requires `sam` CLI to be on your `$PATH`.
 ```
 ./gradlew integrationTest
 ```

### UI Tests

It is **NOT** recommended for third party contributors to run these due to they create and mutate AWS resources.

- Requires valid AWS credentials (take care: it will respect any credentials currently defined in your environmental variables, and fallback to your default AWS profile otherwise).
- Requires `sam` CLI to be on your `$PATH`.
 ```
 ./gradlew :ui-tests:uiTestCore
 ```

#### Debug GUI tests

The sandbox IDE runs with a debug port open (`5005`). In your main IDE, create a Java Remote Debug run configuration and tell it to attach to that port.

If the tests run too quickly, you can tell the UI tests to wait for the debugger to attach by editing the `suspend.set(false)` to `true` in the tasks
`RunIdeForUiTestTask` in [toolkit-intellij-subplugin Gradle plugin](buildSrc/src/main/kotlin/toolkit-intellij-subplugin.gradle.kts)

### Logging

- Log messages (`LOG.info`, `LOG.error()`, …) by default are written to:
  ```
  plugins/toolkit/intellij/build/idea-sandbox/system/log/idea.log
  plugins/toolkit/intellij/build/idea-sandbox/system-test/logs/idea.log  # Tests

  plugins/toolkit/jetbrains-gateway/build/idea-sandbox/system/logs/idea.log  # Gateway
  ```
- DEBUG-level log messages are skipped by default. To enable them, add the
  following line to the _Help_ \> _Debug Log Settings_ dialog in the IDE
  instance started by the `runIde` task:
  ```
  software.aws.toolkits
  ```
  **Please be aware that debug level logs may contain more sensitive information. It is not advisable to keep it on nor share log files that contain debug logs**

## Guidelines

- AWS Explorer should not have "dependencies" (such as `sam` or `cloud-debug`). It should work without needing to install extra stuff.
- Dependencies (such as `sam` or `cloud-debug`) should fetch/install lazily, when the user interacts with a feature that requires them.

## Finding contributions to work on

Looking at the existing issues is a great way to find something to contribute on. Any of the [help wanted](https://github.com/aws/aws-toolkit-jetbrains/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) issues is a great place to start.

## Additional References

* https://plugins.jetbrains.com/docs/intellij/kotlin.html#kotlin-standard-library
* https://plugins.jetbrains.com/docs/intellij/welcome.html
* https://jetbrains.design/intellij/
* https://www.jetbrains.com/help/resharper/sdk/Rider.html
* https://intellij-support.jetbrains.com/hc/en-us/articles/206544519-Directories-used-by-the-IDE-to-store-settings-caches-plugins-and-logs

## Code of Conduct

This project has adopted the [Amazon Open Source Code of Conduct](https://aws.github.io/code-of-conduct). 
For more information see the [Code of Conduct FAQ](https://aws.github.io/code-of-conduct-faq) or contact 
[opensource-codeofconduct@amazon.com](mailto:opensource-codeofconduct@amazon.com) with any additional questions or comments.

## Licensing

See the [LICENSE](LICENSE) file for our project's licensing. We will ask you confirm the licensing of your contribution.

We may ask you to sign a [Contributor License Agreement (CLA)](http://en.wikipedia.org/wiki/Contributor_License_Agreement) for larger changes.
