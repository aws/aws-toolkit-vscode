// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.fixtures

import com.intellij.remoterobot.RemoteRobot

fun RemoteRobot.ideMajorVersion() = callJs<Int>("com.intellij.openapi.application.ApplicationInfo.getInstance().getBuild().getBaselineVersion()")
