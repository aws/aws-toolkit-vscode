// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.popup.listeners

import software.aws.toolkits.jetbrains.services.codewhisperer.model.InvocationContext
import java.awt.event.ActionListener

abstract class CodeWhispererActionListener(val states: InvocationContext) : ActionListener
