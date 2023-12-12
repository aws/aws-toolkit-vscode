// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.datagrip.auth

import com.intellij.database.dataSource.DataSourceSshTunnelConfiguration

fun mockDataSourceSshTunnelConfiguration() = DataSourceSshTunnelConfiguration(true, "config", -1)
