// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection.workflow.v2

import com.jetbrains.gateway.ssh.HighLevelHostAccessor
import com.jetbrains.gateway.ssh.HostDeployContext
import com.jetbrains.gateway.ssh.HostDeployInputs

class HostContext(
    override var config: Unit?,
    override var deployData: HostDeployInputs?,
    override val hostAccessor: HighLevelHostAccessor?,
    override val remoteProjectPath: String?
) : HostDeployContext<Unit>
