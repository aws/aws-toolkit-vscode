# IDE Container Debugging: Error Messaging

## Error Types
The current version of the AWS Toolkit for Jetbrains surfaces errors in a few ways depending on the context. There are four main classes of errors: general errors, AWS explorer errors, build errors, and form errors.

### General Errors
General toolkit errors are shown in a toast in the bottom-right corner of the IDE. Errors shown here are also persisted in the Event Log, which is accessible also from the bottom-right corner of the IDE.

![1]

![2]

This can also be used as a method of surfacing information toasts with links for additional context.

![3]

#### Surfacing Method
* Call a [`NotificationUtils`](https://github.com/aws/aws-toolkit-jetbrains/blob/master/jetbrains-core/src/software/aws/toolkits/jetbrains/utils/NotificationUtils.kt) function
* Throw an error without catching it. This method should not be intentionally used within the toolkit and should be remedied to correctly present an error if this is noticed.

### AWS Explorer Errors
Errors from the AWS Explorer are reflected in a node with the error messaging. The error node includes a tooltip with deeper error information.

![4]

![5]

#### Surfacing Method
* An [`AwsExplorerErrorNode`](https://github.com/aws/aws-toolkit-jetbrains/blob/master/jetbrains-core/src/software/aws/toolkits/jetbrains/core/explorer/nodes/AwsExplorerErrorNode.kt) is manually created and appended to Explorer tree

### Build Errors
Build errors are reflected in a few locations:
1. The status bar at the bottom left corner of the IDE
2. A toast pointing to the status bar
3. The IDE’s Build panel

![6]

![7]

#### Surfacing Method
* Create a [`ProgramRunner`](https://upsource.jetbrains.com/idea-ce/file/idea-ce-e97504227f5f68c58cd623c8f317a134b6d440b5/platform/lang-api/src/com/intellij/execution/runners/ProgramRunner.java) and call `setError()`

### Form Errors
Multiple types of errors can be spawned from JetBrains forms:

* Failed validation
    * Occurs when field validation is engaged. Our current standard is to run validation when a user attempts to submit a wizard.
    * Presents an error message and highlights the input box in red.
    
![8]
* Failed data population
    * Occurs automatically, if the wizard is trying to load data to populate a field and fails
    * Due to the general error aspect, these errors are also propagated to the Event Log.
    
![9]
* Failed run configuration
    * Can occur at any point during a run configuration
    * Presented as a separate error in the bottom of the form. This is not directly tied to a field (like a validation error)
    
![10]

#### Surfacing Method
* Failed validation: return `ValidationInfo` object
* Failed data population: Current standard is to use a [`ResourceSelector`](https://github.com/aws/aws-toolkit-jetbrains/blob/master/jetbrains-core/src/software/aws/toolkits/jetbrains/ui/ResourceSelector.kt) object. If this fails, this draws a general and validation error (through their respective mechanisms).
* Failed run configuration: Throw a RuntimeConfigurationError from a class that extends [`LocatableConfigurationBase`](https://upsource.jetbrains.com/idea-ce/file/idea-ce-d00d8b4ae3ed33097972b8a4286b336bf4ffcfab/platform/lang-api/src/com/intellij/execution/configurations/LocatableConfigurationBase.java)

## Guidelines

* Stack traces displayed in the Event Log should not contain any AWS Toolkit- or IDE-specific stack traces as these are not user actionable. These errors should be logged to the `idea.log`.
* Similarly, the Event Log should display stack traces for any user-actionable errors. In addition, these should also be logged to the `idea.log` file.
* Always log errors to their expected locations.
    * Locations that offer more space (such as the Build Panel) should be able to fit stack trace information.
    * For more constrained spaces (for instance, in a Jetbrains form), display brief error messages in their canonically-correct locations, which also point to the larger stack trace in the Event Log.
    * Consistency is key! For example, the following images show a `sam build` failure (as of August 2019), with the first one from running a SAM application locally vs. building and deploying the SAM app to create a Lambda function; these should both be logged to the Build Panel:

![6]
![1]
 
[1]: images/generalErrorToast.png
[2]: images/generalErrorEventLog.png
[3]: images/generalErrorWarning.png

[4]: images/explorerNode.png
[5]: images/explorerTooltip.png

[6]: images/buildToast.png
[7]: images/buildPanel.png

[8]: images/formValidation.png
[9]: images/formDataPop.png
[10]: images/formRunConfig.png
