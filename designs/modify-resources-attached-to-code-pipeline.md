# Changes to Resources associated with a Code Pipeline

## What is the problem?

When resources are associated with [CodePipeline](https://aws.amazon.com/codepipeline/), operations such as deployment and change management are automatically managed on behalf of the user. CodePipeline-related automation may fail if users manually apply changes to these resources. Additionally, users may not be aware that a specific resource is associated with a CodePipeline.

## <a id="what-will-be-changed"></a>What will be changed?

When users attempt to modify resources associated with a CodePipeline, the Toolkit informs them about the CodePipeline association. The user is then given the choice of cancelling their operation, or proceeding. A link out to corresponding User Documentation is also provided.

The resources this applies to:

-   CloudFormation Stacks
-   Lambda Functions

The modification operations this applies to:

-   Deploying a SAM Application to a CloudFormation Stack
-   Deleting a resource

This design becomes a part of the requirements for future changes to the Toolkit that support additional resources and modification operations.

## <a id="success-criteria"></a>Success criteria for the change

-   Deleting a Lambda Function or CloudFormation Stack associated with a CodePipeline prompts the user to confirm they would like to proceed
-   Deploying a SAM Application to a CloudFormation Stack associated with a CodePipeline prompts the user to confirm they would like to proceed
-   "Prompt the user" is defined as:
    -   Indicating the resource name and type being acted on
    -   Indicating the operation they are attempting to perform on the resource
    -   Indicating the associated CodePipeline
    -   Providing a way of seeing additional information (link to User Guide)
    -   Asking the user in clear language if they would like to perform their operation
    -   If applicable, the default prompt response is to cancel (do not proceed with the operation)

## Out-of-Scope

-   Modifications not listed under [What will be changed](#what-will-be-changed)
-   Resource Types not listed under [What will be changed](#what-will-be-changed)
-   CodePipeline behavior on resources that a user chooses to proceed with a manual operation

## User Experience Walkthrough

### Deleting a Lambda Function

Users delete a Lambda Function through the AWS Explorer by right-clicking on the Function and selecting `Delete`.

Currently:

-   a notification message pops up with the message "Are you sure you want to delete lambda function '`FUNCTION_NAME_HERE`'?"
-   the notification message has `Yes` and `No` buttons

Proposed:

-   If the lambda function is not associated with a CodePipeline, the same experience takes place.
-   If the lambda function is associated with a CodePipeline, the user is given an alternate prompt (see Confirmation Prompt below). If the user agrees to proceed with function deletion, they do not get an additional prompt. The function is deleted.

### Deleting a CloudFormation Stack

Users delete a CloudFormation Stack through the AWS Explorer by right-clicking on the Stack and selecting `Delete CloudFormation Stack`.

Currently:

-   a notification message pops up with the message "Are you sure you want to delete '`STACK_NAME_HERE`'?"
-   the notification message has `Yes` and `No` buttons

Proposed:

-   If the CloudFormation Stack is not associated with a CodePipeline, the same experience takes place.
-   If the CloudFormation Stack is associated with a CodePipeline, the user is given an alternate prompt (see [Confirmation Prompt](#confirmation-prompt) below). If the user agrees to proceed with Stack deletion, they do not get an additional prompt. The Stack is deleted.

### Deploying a SAM Application to an existing CloudFormation Stack

Users deploy a SAM Application using a Command Palette action. Through a Wizard, they are asked for details about what to deploy, and where to deploy it, including specifying a CloudFormation Stack. The stack specified can be new or may already exist. At this time, users must type the stack name in manually. There is a backlog task to replace this with a list that the user can choose a stack from.

Proposed:

-   After the wizard collects all information from the user, we add a final step in the wizard that confirms all of the wizard settings before proceeding.
-   Prior to the wizard settings confirmation we put a busy indicator on the UI (and inform the user that we are performing some validations), and check to see if the Stack belongs to a CodePipeline.
    -   If it does not, the wizard settings confirmation comes up
    -   If it does, the user is given a confirmation prompt (see [Confirmation Prompt](#confirmation-prompt) below).
        -   If the user agrees to proceed with the deploy, it proceeds normally.
        -   If the user elects to back out, the wizard moves back to the step where the user can specify a different CloudFormation Stack.

This approach was chosen for the following reasons:

-   it provides a place to put additional deploy wizard validations
-   performing validations in between each wizard step could introduce latency, causing an unsatisfactory experience

### <a id="confirmation-prompt"></a>Confirmation Prompt

The confirmation prompt contains the following messaging. See [Success criteria](#success-criteria) for the required information.

---

{ AWS Lambda Function | AWS CloudFormation Stack } '`friendly_name_here`' is part of an AWS CodePipeline pipeline (`associated_pipeline`).

Manual modification of resources outside of an AWS CodePipeline will skip any verification steps defined in the pipeline.

If you would like to continue with this manual { deployment | deletion }, please enter the name of the { Lambda Function | CloudFormation Stack }

---

`associated_pipeline` will be the value of the [tag that indicates there is an associated pipeline](#associated-resources)

The user will have the following actions/responses available:

-   a place to enter the name of the Resource as a means of confirming the action
-   `Learn More` - This will link to user documentation (https://docs.aws.amazon.com/codepipeline/latest/userguide) but will not close the confirmation prompt
-   Pressing `Esc` (or similar "Go back" gestures) will act as a cancel mechanic

# Implementation

## Design

### <a id="associated-resources"></a>Resources associated with a pipeline

Resources that have a tag `aws:codepipeline:pipelineArn` are considered to have an association with a pipeline.

Metrics are logged indicating whether or not the Toolkit was successful in determining if there was an associated pipeline - see [Fallback Handling](#fallback-handling).

### Utility Methods

-   a method that determines if an AWS resource is associated with AWS CodePipeline
-   a method that generates confirmation prompt text (if confirmation prompt will exist within a Wizard and as a standalone prompt)
-   a method that encapsulates showing users the (non-wizard) confirmation prompt

### Confirmation Prompt

The confirmation prompt can be implemented using one of two UI facilities:

-   `showInformationMessage`, which pops up a dismissable toast message that can contain buttons
    -   Pros
        -   Compact
        -   "Looks like" a conventional dialog box
    -   Cons
        -   if users press `Esc` on the toast, the toast hides in a queue instead of getting dismissed.
            -   it appears to the user that the flow has stopped ("I don't see the toast anymore") but the flow does not return to the calling code (calling code is actually waiting for a button to be pressed)
        -   Putting a third button along the lines of `More Info...` beside `Yes` and `No` buttons is unconventional
        -   a `More Info...` button dismisses the toast (and would have to be handled as a `No`), ideally the toast would stay open
-   either a `QuickPick` (which presents a list to the user for selection) or `InputBox` (which prompts the user for text). Both are capable of being complemented with buttons that allow for additional actions.
    -   Pros
        -   if users press `Esc` on the QuickPick/InputBox, the QuickPick/InputBox is dismissed, and flow returns to the calling code, which in this case can handle it as an intent to cancel
        -   More consistent UX if the prompt is used both as a standalone prompt, and in a wizard (CloudFormation Stack Deploy alternate proposal uses a wizard)
        -   Flexibility to support actions (like bringing up a help page) while leaving the prompt open
        -   idiomatic to VS Code - using a QuickPick, the `Yes` and `No` choices appear in a selection list
    -   Cons
        -   None

`QuickPick/InputBox` is the appropriate facility to use for the confirmation prompt. The first con listed in the toast approach would cause misleading experiences while accumulating promises that wait for additional action.

### API Client

The `ResourceGroupsTaggingAPI` service client will be used. The client will be set up in a manner consistent with the Lambda and CloudFormation clients, allowing the clients to be stubbed out in unit tests. See the Toolkit's Lambda Client [Interface](/packages/toolkit/src/shared/clients/lambdaClient.ts) and [Implementation](/packages/toolkit/src/shared/clients/defaultLambdaClient.ts) as an example. A new client factory will be added to [ToolkitClientBuilder](/packages/toolkit/src/shared/clients/toolkitClientBuilder.ts) and [DefaultToolkitClientBuilder](/packages/toolkit/src/shared/clients/defaultToolkitClientBuilder.ts).

### <a id="fallback-handling"></a>Fallback Handling

If the Toolkit is unable to determine whether or not a resource is associated with a pipeline, the following actions take place:

-   the issue is logged as a warning
-   the user is not notified
-   the Toolkit behaves as if the resource is not associated with a pipeline

Rationale:

-   users have declared their intention to deploy an application, at this point we do not want to impede them
-   logged metrics will help inform how often the Toolkit fails to determine an association
-   messaging the user could be overly spammy if they cannot affect their environment (example: an account with Lambda permissions but not ResourceGroupsTaggingAPI permissions)

### Unit Tests

-   Deleting a Lambda Function
    -   it does not prompt the user with the pipeline-related confirmation when attempting to delete a Lambda Function that is not associated with a pipeline
    -   it prompts the user with the pipeline-related confirmation when attempting to delete a Lambda Function that is associated with a pipeline
    -   it does not prompt the user with the pipeline-related confirmation when attempting to delete a Lambda Function and pipeline associations cannot be determined
-   Deleting a CloudFormation Stack
    -   it does not prompt the user with the pipeline-related confirmation when attempting to delete a CloudFormation Stack that is not associated with a pipeline
    -   it prompts the user with the pipeline-related confirmation when attempting to delete a CloudFormation Stack that is associated with a pipeline
    -   it does not prompt the user with the pipeline-related confirmation when attempting to delete a CloudFormation Stack and pipeline associations cannot be determined
-   Deploying a SAM Application
    -   it does not prompt the user with the pipeline-related confirmation when attempting to deploy a SAM Application to a CloudFormation Stack that is not associated with a pipeline
    -   it prompts the user with the pipeline-related confirmation when attempting to deploy a SAM Application to a CloudFormation Stack that is associated with a pipeline
    -   it continues to prompt the user if they attempt to select the same stack again
    -   it does not prompt the user with the pipeline-related confirmation when attempting to deploy a SAM Application to a CloudFormation Stack and pipeline associations cannot be determined

### System Tests

The Toolkit does not have System Tests at this time. System Tests task(s) will be added to the backlog, to be worked on after a Systems Level testing has been designed and created for the Toolkit.

-   it prompts the user for confirmation when attempting to delete a Lambda Function that is associated with a pipeline
-   it prompts the user for confirmation when attempting to delete a CloudFormation Stack that is associated with a pipeline
-   it prompts the user for confirmation when attempting to deploy a SAM Application to an existing CloudFormation Stack that is associated with a pipeline

### Other Design Decisions

-   Caching information on the Explorer (like pipeline associations) exposes the Toolkit to edge case scenarios (timing issues, data volume, state freshness). The Toolkit will query on an as-needed basis at this time.

## Documentation Changes

-   User documentation should be revised around the following topics, to mention that resources associated with a pipeline may have additional impact, and that users will be prompted to confirm that they would like to proceed:
    -   Deleting a Lambda Function
    -   Deleting a CloudFormation Stack
    -   Publishing a SAM Application

## Open Issues

## Task Breakdown

-   [ ] Send a Pull Request with this design document
-   [ ] Generate Backlog Issues
-   [ ] Engage documentation updates
-   TODO : List backlog issues here after they are created
