# CloudWatch Logs Experience

* **Type**: UX Design
* **Status**: Accepted, not implemented

## Introduction
CloudWatch Logs enables a user to centralize the logs from all of their systems, applications, and AWS services that they use, in a single, highly scalable service. This document describes adding CloudWatch Logs functionality into the JetBrains toolkit in order to facilitate easily viewing and searching them for specific error codes or patterns.

## Comparison to other products

### AWS Toolkit for VSCode  
Not supported

### AWS Toolkit for Visual Studio  
Supports listing of Lambda CloudWatch Log Streams and downloading them to a temporary file and opening it in Notepad

## Experience

### View Log Groups
The AWS Explorer gains a CloudWatch root node for interacting wit CloudWatch service. The node lists all the Log Groups that exist in the selected region for the selected credential profile as child nodes. Double clicking a Log Group opens the CloudWatch tool window with the tab for the Log Streams that belong to that group. A new tab is in the tool window is created if one does not already exist.

*Browsing Log Groups in AWS Explorer:*<br />
![BROWSE_LOG_GROUP]

### View Log Streams
Upon selecting a Log Group, a new tab in the CloudWatch tool window is shown to the user. This new tab lists all the streams for the requested group to allow the user to find the exact stream they are looking for.

Log Streams can also be sorted by name or last event time in order to help facilitate finding the Log Stream of interest.

*View all Log Streams in the selected Log Group:*<br />
![BROWSE_LOG_STREAMS]

#### Navigate to a Log Stream
Double clicking the Log group in the AWS Explorer opens the Log Stream selection. 

For additional service integrations, such as a Lambda function, where we know what Log Group is associated with the resource a new context menu action adds the ability to bypass having to search for the Log Group and instead open the Log Stream selection directly.

### View A Log Stream
Each Log Stream the user selects opens in its own tab to allow for browsing multiple streams at the time. The Log Stream tab is scoped to the region and credentials used to open it so that the user can browse across regions and accounts at the same time.

*View of a Log Stream:*<br />
![VIEW_LOG_STREAM]

#### Treat as...
The Treat As feature acts as a Log Event post-processor to convert the Log Event into a more readable format. This feature provides a pre-defined list of formats such as JSON, Plain Text, CSV, or [CLF](https://httpd.apache.org/docs/1.3/logs.html#common). The formats process each Log Event and convert them into a more tabular format where each column maps to an extract format. The filter feature filters on these extracted values.

*Treat As -> JSON:*<br />
![VIEW_LOG_STREAM_JSON]

#### View events around...
In order to facilitate easier triaging, users should be able to search for events such as "Exception" or "Error". This filters the currant Log Stream's events to events that contain the specified string. The user can then right click a Log Entry and select `View events around...`. This context menu action provides a list of pre-canned durations (i.e. `30 seconds`, `1 minute`, `5 minutes`, `custom`) that opens up a new Log Stream tab with that duration pre-selected. This allows the user to see events that led up to and resulted from the error they were searching for without losing their triage progress.

#### Tail Stream
TODO

## Appendix

### Terminology

#### Log Group
Log groups define groups of log streams that share the same retention, monitoring, and access control settings. Each log stream has to belong to one log group. For example, if you have a separate log stream for the Apache access logs from each host, you could group those log streams into a single log group called MyWebsite.com/Apache/access_log.

#### Log Stream
A log stream is a sequence of log events that share the same source. More specifically, a log stream is generally intended to represent the sequence of events coming from the application instance or resource being monitored. For example, a log stream may be associated with an Apache access log on a specific host. 

#### Log Events
A log event is a record of some activity recorded by the application or resource being monitored. The log event record that CloudWatch Logs understands contains two properties: the timestamp of when the event occurred, and the raw event message.

#### Alternatives Considered
Instead of building a new CloudWatch service node in the AWS Explorer, we instead build a CloudWatch Log Group browser tab in the CloudWatch tool window. This new tab is also be linked to the active AWS connection settings. This differs from the other tabs which may lead to a confusing user experience and seen as a con.

*Possible alternative for browsing Log Groups:*<br />
![ALT_BROWSE_LOG_GROUP]

[BROWSE_LOG_GROUP]: images/explorerLogGroups.png
[ALT_BROWSE_LOG_GROUP]: images/toolWindowLogGroup.png
[BROWSE_LOG_STREAMS]: images/toolWindowLogStreams.png
[VIEW_LOG_STREAM]: images/viewLogStream.png
[VIEW_LOG_STREAM_JSON]: images/viewLogStreamJson.png
