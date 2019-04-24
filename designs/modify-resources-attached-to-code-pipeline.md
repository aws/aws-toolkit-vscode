Changes to Resources associated with a Code Pipeline
====================================

What is the problem?
--------------------

When resources are associated with [CodePipeline](https://aws.amazon.com/codepipeline/), operations such as deployment and change management are automatically managed on behalf of the user. CodePipeline-related automation may fail if users manually apply changes to these resources. Additionally, users may not be aware that a specific resource is associated with a CodePipeline.

<a id="what-will-be-changed"></a>What will be changed?
---------------------

When users attempt to modify resources associated with a CodePipeline, the Toolkit informs them about the CodePipeline association. The user is then given the choice of cancelling their operation, or proceeding. A link out to corresponding User Documentation is also provided.

The resources this applies to:
* CloudFormation Stacks
* Lambda Functions

The modification operations this applies to:
* Deploying a SAM Application to a CloudFormation Stack
* Deleting a resource

This design becomes a part of the requirements for future changes to the Toolkit that support additional resources and modification operations.

<a id="success-criteria"></a>Success criteria for the change
-------------------------------

* Deleting a Lambda Function or CloudFormation Stack associated with a CodePipeline prompts the user to confirm they would like to proceed
* Deploying a SAM Application to a CloudFormation Stack associated with a CodePipeline prompts the user to confirm they would like to proceed
* "Prompt the user" is defined as:
  * Indicating the resource name and type being acted on
  * Indicating the operation they are attempting to perform on the resource
  * Indicating the associated CodePipeline
  * Providing a way of seeing additional information (link to User Guide)
  * Asking the user in clear language if they would like to peform their operation
  * If applicable, the default prompt response is to cancel (do not proceed with the operation)

Out-of-Scope
------------

* Modifications not listed under [What will be changed](#what-will-be-changed)
* Resource Types not listed under [What will be changed](#what-will-be-changed)
* CodePipeline behavior on resources that a user chooses to proceed with a manual operation

User Experience Walkthrough
---------------------------

### Deleting a Lambda Function

Users delete a Lambda Function through the AWS Explorer by right-clicking on the Function and selecting `Delete`.

Currently:
* a notification message pops up with the message "Are you sure you want to delete lambda function '`FUNCTION_NAME_HERE`'?"
* the notification message has `Yes` and `No` buttons

Proposed:
* If the lambda function is not associated with a CodePipeline, the same experience takes place.
* If the lambda function is associated with a CodePipeline, the user is given an alternate prompt (see Confirmation Prompt below). If the user agrees to proceed with function deletion, they do not get an additional prompt. The function is deleted.

### Deleting a CloudFormation Stack

Users delete a CloudFormation Stack through the AWS Explorer by right-clicking on the Stack and selecting `Delete CloudFormation Stack`.

Currently:
* a notification message pops up with the message "Are you sure you want to delete '`STACK_NAME_HERE`'?"
* the notification message has `Yes` and `No` buttons

Proposed:
* If the CloudFormation Stack is not associated with a CodePipeline, the same experience takes place.
* If the CloudFormation Stack is associated with a CodePipeline, the user is given an alternate prompt (see [Confirmation Prompt](#confirmation-prompt) below). If the user agrees to proceed with Stack deletion, they do not get an additional prompt. The Stack is deleted.

### Deploying a SAM Application to an existing CloudFormation Stack

Users deploy a SAM Application using a Command Palette action. Through a Wizard, they are asked for details about what to deploy, and where to deploy it, including specifying a CloudFormation Stack. The stack specified can be new or may already exist. At this time, users must type the stack name in manually. There is a backlog task to replace this with a list that the user can choose a stack from.

Proposed:
* After the wizard collects all information from the user, we check to see if the Stack belongs to a CodePipeline.
  * If it does not, the deploy proceeds.
  * If it does, the user is given a confirmation prompt (see [Confirmation Prompt](#confirmation-prompt) below).
    * If the user agrees to proceed with the deploy, it proceeds normally.
    * If the user elects to back out, nothing happens - the wizard has already ended, and the user is back in the editor.

Alternate:
* After the user enters a CloudFormation Stack, but before the wizard closes, we check to see if the Stack belongs to a CodePipeline.
  * If it does not, the wizard continues.
  * If it does, the user is given a confirmation prompt, however this confirmation prompt is integrated with the wizard.
    * If the user agrees to proceed with the deploy, the wizard moves on to the next step.
    * If the user elects to back out, the wizard moves back to the step where the user can specify a different CloudFormation Stack.

### <a id="confirmation-prompt"></a>Confirmation Prompt

The confirmation prompt contains the following messaging. See [Success criteria](#success-criteria) for the required information.

---

{ AWS Lambda Function | AWS CloudFormation Stack } '`arn_here`' is part of an AWS CodePipeline pipeline (`pipeline_arn_here`).

Manual modification of resources outside of an AWS CodePipeline will skip any verification steps defined in the pipeline.

Do you want to continue with this manual { deployment | deletion }?

---

The user will have the following actions/responses available:
* `Yes` - proceeds with the manual operation
* `No` - The default - Cancels the current operation (or goes back a step in the case of a wizard)
* `Learn More` - This will link to user documentation (https://docs.aws.amazon.com/codepipeline/latest/userguide) but will not close the confirmation prompt

Implementation
==============

Design
------

### Resources associated with a pipeline

Resources that have a tag `aws:codepipeline:pipelineArn` are considered to have an association with a pipeline.

### Utility Methods
* a method that determines if an AWS resource is associated with AWS CodePipeline
* a method that generates confirmation prompt text (if confirmation prompt will exist within a Wizard and as a standalone prompt)
* a method that encapsulates showing users the (non-wizard) confirmation prompt

### Confirmation Prompt

The confirmation prompt is a QuickPick instead of a message box.
* The message box can be "dismissed" with the `Esc` key, which hides it in a "message box queue" rather than cancelling the message. The user flow appears to be cancelled, but in reality it is suspended (until the queued message box is restored, and a button is pressed).
* QuickPick provides flexibility to add buttons to the UI (for example: a "Help" Button), and is appropriately cancel-able.

### API Client

The `ResourceGroupsTaggingAPI` service client will be used. The client will be set up in a manner consistent with the Lambda and CloudFormation clients, allowing the clients to be stubbed out in unit tests. See the Toolkit's Lambda Client [Interface](/src/shared/clients/lambdaClient.ts) and [Implementation](/src/shared/clients/defaultLambdaClient.ts) as an example. A new client factory will be added to [ToolkitClientBuilder](/src/shared/clients/toolkitClientBuilder.ts) and [DefaultToolkitClientBuilder](/src/shared/clients/defaultToolkitClientBuilder.ts).

### Unit Tests

* Deleting a Lambda Function
  * it does not prompt the user with the pipeline-related confirmation when attempting to delete a Lambda Function that is not associated with a pipeline
  * it prompts the user with the pipeline-related confirmation when attempting to delete a Lambda Function that is associated with a pipeline
* Deleting a CloudFormation Stack
  * it does not prompt the user with the pipeline-related confirmation when attempting to delete a CloudFormation Stack that is not associated with a pipeline
  * it prompts the user with the pipeline-related confirmation when attempting to delete a CloudFormation Stack that is associated with a pipeline
* Deploying a SAM Application
  * it does not prompt the user with the pipeline-related confirmation when attempting to deploy a SAM Application to a CloudFormation Stack that is not associated with a pipeline
  * it prompts the user with the pipeline-related confirmation when attempting to deploy a SAM Application to a CloudFormation Stack that is associated with a pipeline
  * it continues to prompt the user if they attempt to select the same stack again

### System Tests

The Toolkit does not have System Tests at this time. System Tests task(s) will be added to the backlog, to be worked on after a Systems Level testing has been designed and created for the Toolkit.

* it prompts the user for confirmation when attempting to delete a Lambda Function that is associated with a pipeline
* it prompts the user for confirmation when attempting to delete a CloudFormation Stack that is associated with a pipeline
* it prompts the user for confirmation when attempting to deploy a SAM Application to an existing CloudFormation Stack that is associated with a pipeline


Documentation Changes
---------------------

* User documentation should be revised around the following topics, to mention that resources associated with a pipeline may have additional impact, and that users will be prompted to confirm that they would like to proceed:
  * Deleting a Lambda Function
  * Deleting a CloudFormation Stack
  * Publishing a SAM Application

Open Issues
-----------

Task Breakdown
--------------

- [ ] Send a Pull Request with this design document
- [ ] Generate Backlog Issues 
- [ ] Engage documentation updates
- TODO : List backlog issues here after they are created
