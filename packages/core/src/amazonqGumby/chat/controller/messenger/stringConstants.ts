/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 */

export const enterJavaHomeMessage = 'Enter the path to JDK '

export const windowsJavaHomeHelpMessage =
    'To find the JAVA_HOME path, run the following command in a new IDE terminal: `cd "C:Program FilesJava" && dir`. If you see your JDK version, run `cd <version>` and then `cd` to show the path.'

export const nonWindowsJava8HomeHelpMessage =
    'To find the JAVA_HOME path, run the following command in a new IDE terminal:  `/usr/libexec/java_home -v 1.8`'

export const nonWindowsJava11HomeHelpMessage =
    'To find the JAVA_HOME path, run the following command in a new IDE terminal:  `/usr/libexec/java_home -v 11`'

export const projectSizeTooLargeMessage =
    'Your project size exceeds the Amazon Q Code Transformation upload limit of 1GB. For more information, see the [Code Transformation documentation](LINK_HERE).'

export const JDK8VersionNumber = '52'

export const JDK11VersionNumber = '55'
