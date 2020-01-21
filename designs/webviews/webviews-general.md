# Webviews for Rich UIs in VS Code

## Objective

Justify expanding the criteria for using webviews within the AWS Toolkit for VS Code in order to create richer UIs than VS Code natively allows.

### Out-of-scope

* Architectures or frameworks for the webviews
  * A best-practices guide to developing webviews with the architecture/framework decided on above.
* Look and feel discussions
* A detailed list of user experiences to port to webviews

## Tenets (unless you know better ones)

1. Users should have a delightful experience when interacting with AWS features through our AWS Toolkit.
2. We should not limit ourselves to IDE-specific conventions if it does not provide the best user experience possible.
3. We should do our best to not compromise the VS Code editor's or our toolkit's performance; using our toolkit should be an easy choice for an AWS developer to make, rather than a compromise.

## Current State

VS Code offers a very limited set of UI functionality. Specifically, VS Code offers the following constructs for user-interactible workflows:

* [Quick Picks](https://code.visualstudio.com/api/extension-capabilities/common-capabilities#quick-pick), which present a list of options for a user to select. Users can select one or multiple items and can filter the list but cannot add to it.
* [Input Boxes](https://code.visualstudio.com/api/extension-capabilities/common-capabilities#quick-pick), which allow a user to submit a string.
* [File Pickers](https://code.visualstudio.com/api/extension-capabilities/common-capabilities#file-picker), which allow a user to choose a file or directory.
* [Modal/Non-Modal/Status Bar Messages](https://code.visualstudio.com/api/references/vscode-api#window), which can contain arbitrary buttons.
* [Tree Views](https://code.visualstudio.com/api/references/vscode-api#TreeView), representing hierarchical information.

The workflow-centric constructs (quick picks, input boxes, and file pickers) can only be displayed one at a time, which can lead to confusion in workflows where users are sequentially asked for inputs. For instance, a previous step's selection is invalid could cause a current selection to become invalid, Backtracking through the workflow to correct the mistake (or simply change values) is a pain point. These workflows also remove the user's context, forcing them to backtrack to remember what they entered previously.

Another major reported pain point from working within the VS Code-specific constructs come from some of the confusion with how the inputs look the same but register differently depending on their type; an example can be seen in [the following Github issue](https://github.com/aws/aws-toolkit-vscode/issues/650).

Our toolkit does currently include some webviews based on Vue.js. These webviews for the most part get the job done but have an inconsistent design and have little to no styling. These webviews are also written in Javascript, eschewing any type safety. Furthermore, they use a relatively esoteric Lodash-based templating system to create their HTML. We have limited their use within the toolkit, both due to these facts as well as a desire to stay as close to native VS Code constructs as possible; the only workflows that use these are for remote AWS Lambda invocations and EventBridge Schema searching, which both feature use-cases that are too complex for the workflow constructs.

All of our other IDE toolkits feature interactibility via form-like interfaces, showing multiple fields at a time and allowing for validation of individual elements upon submission without having to backtrack through multiple steps.

## Proposed Solution

I propose we move more complex UIs to VS Code webviews, with "more complex" defined as:

* UIs with multiple inputs that could invalidate or change other data
  * For instance: changing an AWS region, which changes the values present in select boxes
* UIs where users don't have a reason to act in a linear fashion
  * For instance: a form wrapping an AWS service call, where a user would want to enter ARNs from multiple locations
* UIs that have more complex inputs, e.g. arbitrary file paths (especially to support drag-and-drop), JSON, etc.
* Forms that could feasibly be submitted more than once, e.g. Lambda invocations
* UIs that involve paginated loading and filtering from the Node backend
* Forms that could benefit from being displayed next to something else, instead of dominating focus
* UIs with arbitrary, non-form-like functionality
  * For instance: UIs that display read-only data
* UIs involving more than 3 steps (or some other arbitrary number to denote complexity)

We should not abandon the use of VS Code UI constructs. VS Code constructs excel at quickly inputting small amounts of data, especially if it's in a fairly linear fashion, without much need for backtracking. Additionally, VS Code offers a fully-featured tree view interface; unless this absolutely requires integration into a workflow, we should keep tree views within the IDE.

As an example, based on these rules, I would propose we do the following with our current workflows:

| Workflow Name                        | Move to Webview? | Why? |
| ------------------------------------ | ---------------- | ---- |
| Connect to AWS                       | No               | Selecting a single option from a list. |
| Show region in the explorer          | No               | Selecting a single option from a list. |
| Hide region in the explorer          | No               | Selecting a single option from a list. |
| Create credential profile            | No               | Opens an existing file for editing with a link to documentation and involves no connection to a backend. |
| Create SAM Application               | Yes              | Brings us closer to a form-like interface and allows us to add more config options (e.g. the Jetbrains Create workflow). |
| Configure SAM Application (codelens) | Yes              | Gives us a true interface to configure local invocations instead of a confusing JSON file. Experience could be made similar to the Cloud9 and Jetbrains local invokers. |
| Deploy SAM Application               | Yes              | Would be a more logical flow when populating data based on region. Users can change region and invalidate other fields, and refresh potential selections. |

VS Code webviews are not a cureall, and introduce a new set of complexities. A list, along with mitigations, follows:

* Webviews are HTML + JS running in an `iframe`, which adds a considerable resource burden on the IDE (see Appendix 1).
  * Webviews offer a `retainContextWhenHidden` which is false by default. If false, when the webview goes to the background, it is no longer rendered, and re-rendered when it regains context.
* If webviews aren't configured to persist context when a user moves it to the background, the webview will have to re-render, losing any unsaved state.
  * This is only a concern if `retainContextWhenHidden` is false (which is recommended). VS Code lets you set a JSON-serilaizable state which can be reloaded when regaining context, via prorpietary VS Code functions, `vscode.getState` and `vscode.setState`.
    * This can also be used to restore state between VS Code sessions using a `WebviewPanelSerializer`.
* Webviews are separate from the background process.
  * Webviews feature a two-way messaging system, which are by default untyped. All messages must be valid JSON.
    * The backend can post via `vscode.WebviewPanel.webview.postMessage`, which can then be picked up by an `eventListener` on the frontend, listening for  `message` events.
      * One caveat: messages should only be posted to the webview while the webview is active, ideally on frontend request.
        * Messages to dormant webviews are batched and received by the webview on load, but are added to the Javascript event queue. If the webview is rehibernated prior to processing the message from the queue, the message will be lost as VS Code will have sent it, but the event queue will have been wiped.
        * Messages should additionally carry as full of a state as possible; this makes webviews more resilient to dropping messages (since the next state will carry a full slate of information)
    * The frontend can post to the backend by proprietary VS Code function, `vscode.postMessage`, which is then picked up by the frontend via `vscode.WebviewPanel.webview.onDidReceiveMessage`, which invokes a callback function on the message.

## Appendicies

### Appendix 1: "Should I use a webview?" -- from the [VS Code documentation](https://code.visualstudio.com/api/extension-guides/webview#should-i-use-a-webview)

Webviews are pretty amazing, but they should also be used sparingly and only when VS Code's native API is inadequate. Webviews are resource heavy and run in a separate context from normal extensions. A poorly designed webview can also easily feel out of place within VS Code.

Before using a webview, please consider the following:

* Does this functionality really need to live within VS Code? Would it be better as a separate application or website?
* Is a webview the only way to implement your feature? Can you use the regular VS Code APIs instead?
* Will your webview add enough user value to justify its high resource cost?

Remember: Just because you can do something with webviews, doesn't mean you should.
