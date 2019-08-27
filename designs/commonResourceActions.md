# Common Resource Actions

**Status**: Not Implemented see [#1184][5]

From the AWS Explorer there are several actions that are common across different resource types. Current examples are:
* Copy Arn
* Delete \<Resource Type\>...

### Tenants
* Resource actions should appear consistently (same menu order across different resource types)
* Destructive actions should be separated visually (e.g. the delete resource action should appear after a menu separator)
* Actions that initiate additional dialogs should be suffixed with ellipses (...) to be consistent with industry-standard UX
* New resource types can be added easily
* Actions on resources should use contextualized resource name rather than 'fully qualified' (e.g. favor `Delete Stack...` over `Delete CloudFormation Stack...`)
  * this is primarily a UX tenant since we already have the context based on the explorer node hierarchy

### Proposed Order

Using the current actions as a guide the following is the proposed order/style for how they should be displayed:

* Copy Arn
* \<separator\>
* Delete \<Resource Type\>... 

![1]

## Design

Actions should be added based on node capability. The [`ExplorerToolWindow`][2] logic to add `CopyArnAction` would be extended to add other common actions based on a nodes 'capability'. Nodes
capability would be determined by the presence or absence of certain interfaces, e.g. `DeleteResourceAction` would be added for nodes that implement
`DeletableResource`.

**Pros**
* Single implementation for each common action ensures consistent ordering and presentation (e.g. ellipses, separators)
  * Resource-specific logic will be provided by appropriate interface implementations e.g. `DeletableResource` would have a `performDelete()` function
* New resources can easily add new common actions by implementing appropriate interfaces
* Encourages composition, makes actual `performDelete` actions easier to test without having to understand and mock `ActionEvents`
* Less XML configuration (yay - xml is annoying)
* Less context to pass around - a node already has information on how to action itself (e.g. it may already have an instance of an `SdkClient`)

**Cons**
* It's a little less obvious how common actions become associated with a node (magic)
* Nodes may become bloated, containing logic for common actions (e.g. a resource's delete implementation)
  * mitigation: logic for the actual delete could be passed in at construction time

This is the only approach that programmatically controls the tenants of action ordering and presentation, putting this logic in
configuration risks inconsistencies creeping in without an ability to automatically detect them. 

## Alternatives Considered

### Config Driven

In this approach the logic currently in [`ExplorerToolWindow`][2] that adds the `CopyArnAction` for nodes that implement `AwsExplorerResourceNode` would be
removed and instead the Copy ARN action (and any other actions) would be configured against the action-group for each resource in the [`plugin.xml`][3].

**Pros**
* All explorer node actions are configured in one place ([`plugin.xml`][3]) - may seem less magical
* Logic for common actions is separated from nodes themselves ([SRP][4])

**Cons**
* May be difficult to enforce the ordering across many resource types (especially as our resource count and common action count increases)
* Every new resource type has to have a new action-group added with all the relevant actions
* Encourages extension, which becomes difficult to test (e.g. currently `DeleteFunctionAction` extends `DeleteResourceAction`)

[1]: images/common-resource-actions-example.png
[2]: https://github.com/aws/aws-toolkit-jetbrains/blob/dffc7a8420cce51b21c937952a0330222ff564f8/jetbrains-core/src/software/aws/toolkits/jetbrains/core/explorer/ExplorerToolWindow.kt#L124
[3]: https://github.com/aws/aws-toolkit-jetbrains/blob/dffc7a8420cce51b21c937952a0330222ff564f8/jetbrains-core/resources/META-INF/plugin.xml#L206
[4]: https://en.wikipedia.org/wiki/Single_responsibility_principle
[5]: https://github.com/aws/aws-toolkit-jetbrains/issues/1184