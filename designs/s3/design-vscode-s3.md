# UX: S3 explorer

* **Type**: UX Design
* **Status**: Proposal

## Overview

This document proposes a user experience for interacting with AWS S3 from the
AWS Toolkit ("the Toolkit") for Visual Studio Code ("VSCode").

Some of the described features are vague: in those cases the UX should draw
from (in order of preference, as applicable) VSCode, platform, or AWS web
console conventions.

VSCode is a text editor, so extensions should harmonize with text editor
concepts. Avoid creating _inner platforms_. For example, instead of a bespoke
"S3 browser application" presented as a webview, leverage the standard VSCode
"tree" panel. Limitations of VSCode idioms do not automatically demand an inner
platform: instead consider accepting the limitations as an opportunity to (1)
implement coverage for more AWS services, and (2) communicate with VSCode
upstream to understand current idioms and shape future direction.

From [the VSCode docs](https://code.visualstudio.com/api/extension-guides/webview):

> Webviews are pretty amazing, but they should also be used sparingly

## Legend

- (IMPL): item describes potential implementation details
- (P0,…,PN): "phase 0", …, "phase n", where "phase 0" is the minimum viable product and later phases are iterations following an initial release
- (BLOCKED): item requires features not yet available in VSCode

## Experience

Each region of the Toolkit explorer tree includes an S3 node (see mockup
below). The toolkit pulls a list of names and properties of S3 objects in the
currently active profile and presents this data as a tree in the toolkit
explorer, as is typical of existing toolkit features such as "Schemas" and
"Lambda".

- When a region is expanded, make an eager request to get the count of S3
  buckets for that region.
  - The goal is to avoid "frustrated clicks", where user must click on things
    only to discover that they're empty. (User _already_ expanded the Region
    node, why make them click on each service?)
  - Alternative (less-expensive): don't show the count, but _do_ show
    a positive indication of "empty". Checking "non-empty" for all supported
    services is relatively cheap.
  - (IMPL) Do not block UI thread during these pre-emptive fetches.
- Show the count of buckets next to the S3 node.
- The S3 node is always present.
- If there are no buckets in the region, indicate this "eagerly" to save
  "frustrated clicks" (where user must do extra work to confirm absence):
  - remove the "expander"
    - (BLOCKED) "grey-out"/"disabled" style
  - show a count of zero
- When the current active profile changes, the tree is collapsed or refreshed
  (following the common Toolkit behavior).
- When a bucket or object is created or deleted, only that node is added or
  removed from the tree, _without disturbing the current layout of the tree_.

![](design-vscode-s3-tree.png)

### Pagination

AWS buckets or folders may contain thousands of items, which strains the
usefulness of a human-computer interface.  For resource efficiency, _paging_
downloads only one "page" of items, and the user must take some action to get
more items. Toolkit paging works like this:

- `More...` action:
  - If the number of items in a list exceeds the _page size_, add a clickable `More...` node at the end of the list
  - `More...` action appends the next page of items to the existing list.
- `Filter...` action:
  - Mouse-hover on a bucket/folder reveals [inline](https://code.visualstudio.com/api/extension-guides/tree-view#view-actions) `Filter...` button
  - Context-menu (right-click) includes `Filter...` menu item
  - If user invokes `Filter...` on a bucket/folder, prompt for a string. The
    bucket/folder requests only items containing that string.

### S3 buckets

Buckets are listed as children of the "S3" root node.

- Toolkit toolbar:
  <br><img src="design-vscode-s3-toolbar.png" width="200"/>
  - (P0) When any S3 node (bucket/folder/object) is selected, Toolkit toolbar
    enables an "Upload..." button.
    - If a non-folder object is selected, "Upload..." targets the object's parent folder.
- S3 root node context menu (right-click):
  - (P0) Create bucket
- Bucket node context menu (right-click):
  - (P0) Copy ARN
  - (P0) Copy name
  - (P0) New folder...
  - (P0) Upload...
  - _Destructive operations (separator):_
    - (P1) Delete bucket
      - "super confirm": similar to AWS web console, show a prompt which requires typing the word "Delete"

### S3 objects

S3 objects and folders are listed as children of their respective parent bucket/folder.

- (P0) Clicking an object in the tree selects it, but does not perform any action.
- (P2) User input activates standard VSCode local, as-you-type filtering.
- S3 object node context menu (right-click):
  - (P0) Copy ARN
  - (P0) Copy URL
  - (P0) Copy name
  - (P0) Download
    - Does _not_ present a chooser.
    - Downloads immediately to the OS default "Downloads" location (typically `~/Downloads`).
    - Present download status as a toaster message containing this info:
      - Path to the download location.
        - On completion, the path becomes a linkbutton, which onclick opens the file in VSCode.
      - "Choose location..." linkbutton.
        - User can change the download location via this link. This changes the
          default location for future downloads.
        - Default download location is also configurable as a global Toolkit
          option. This is not S3-specific, it is used for all "Download"
          experiences in the Toolkit.
      - (P2) Loading bar or updating percentage.
  - (P0) Download as...
  - (P2) Edit
    - Downloads the object to a temp folder and opens it in a new VSCode editor tab.
    - Changes to text files (non-binary) are sync'd back to S3 via _filewatchers_ (IMPL).
  - _Destructive operations (separator):_
    - (P1) Delete object
      - If versioning is enabled, do _not_ prompt to confirm deletion.
        - Show a passive toaster message: _Deleted `foo.txt`. `Undo` from previous versions?_
        - If user clicks `Undo` in the toaster message, restore the file from the previous versions list.
      - If versioning is not enabled, show a prompt to confirm deletion :(
        - Show a passive toaster message: _Deleted `foo.txt`. (Cannot undo because S3 bucket versioning is disabled.)_

### S3 bucket properties

Surface these important bucket properties in a clear yet uncluttered manner:

- (P1) "Public accessible": show icon (same as AWS web console) next to bucket
  name indicating that it is publicly accessible.
- (P1) "Versioning enabled": show icon next to bucket name indicating that
  versioning is enabled.

### S3 object properties

S3 object properties _size_, _last modified date_, and _previous versions_ (if
versioning is enabled) are surfaced as follows:

- (P0) _Size_ and _last modified date_ are exposed in a tooltip.
  - Example: `42 kb, 2020-02-10 00:01:02 EST`
- (P1) _Versions_: if versioning is enabled on the bucket and an object has previous versions:
  - Mouse-hover on an item reveals an [inline](https://code.visualstudio.com/api/extension-guides/tree-view#view-actions) "Versions..." button
    <br><img src="design-s3-hover-versions.png" width="200"/>
  - Context-menu (right-click) enables "Previous versions..." menu item
    - (BLOCKED) grey-out or "disable" the menu item if bucket versioning is disabled or the item does not have previous versions available.
  - Show an icon (count? ellipsis?) next to the object name, to indicate
    that previous versions are available.  Example: `foo.txt (…)`
  - versions are presented as children of the object (when requested by one of the above actions).

### ([BLOCKED](https://github.com/microsoft/vscode/issues/32592)) Drag-drop from client to server

- Drag a folder from the local system to the S3 tree:
  - onto a bucket uploads as a new top-level folder in the bucket
  - onto a folder uploads as a new subfolder
- Drag a file from the local system to the S3 tree:
  - onto a bucket uploads the file as a top-level object in the bucket
  - onto a folder uploads the file as an object in the folder
- Drag a VSCode editor tab to the S3 tree
  - onto a bucket uploads the file as a top-level object in the bucket
  - onto a folder uploads the file as an object in the folder

### ([BLOCKED](https://github.com/microsoft/vscode/issues/32592)) Drag-drop server-side

- User can [copy objects](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CopyObject.html) or folders from one folder to another by drag-drop.
- User can [copy objects](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CopyObject.html) or folders _across regions_ by dragging from one region
  to another.

## Out of scope

These concepts are out of scope in this proposal, but may be developed in later proposals:

* "Sorting" items by name or other properties.
* "Moving" objects or folders. To "move" an object, user must copy the object,
  then delete the original location.
* List/browser view. The tree/explorer in the left-column is the idiomatic way
  to explore data in VSCode. See how much leverage we can get out of that
  common interface before introducing bespoke UIs.
- Sync local edits to S3:
  - Local filewatcher to auto-upload S3 object when it is changed locally.
  - VSCode "workspace" node for each S3 bucket.
* Readonly views: https://code.visualstudio.com/api/extension-guides/virtual-documents
  - Use [fs overlay](https://code.visualstudio.com/api/extension-guides/virtual-documents#file-system-api)
    to "sync" local changes to S3.
* Pinning ([ref](https://github.com/aws/aws-toolkit-jetbrains/issues/90)):
  ability to save AWS constructs to a "recent" or "favorites" area is useful,
  but requires a holistic treatment: it makes sense for any AWS object, not
  only S3.

## Unknowns

We will revisit these concepts later, depending on larger discussions or
third-party developments:

* VSCode may offer a rich UI component framework in the future.

## Definitions

* folder: S3 key/prefix which is treated like a folder in the AWS web console.
* object: any file in a bucket. Each object has a key, which is a prefix + filename.
* path: the full path to an object is bucket + prefix + filename.

## Comparison to other products

| Product                       | Difference    |
|-------------------------------|---------------|
| AWS Toolkit for Visual Studio | Supported |
| AWS Toolkit for JetBrains     | Supported |

The JetBrains AWS Toolkit S3 tab (see below) exposes Size and Date fields and
the list can be sorted on these columns. Implementing such a tab is a "phase 2"
priority for the VSCode S3 experience.

![](jetbrains-s3.png)
