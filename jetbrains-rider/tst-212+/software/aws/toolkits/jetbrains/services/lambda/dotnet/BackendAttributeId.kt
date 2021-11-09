// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import com.jetbrains.rdclient.daemon.util.backendAttributeId

@Suppress("UnsafeCallOnNullableType")
fun com.intellij.openapi.editor.markup.RangeHighlighter.attributeId() = this.backendAttributeId!!
