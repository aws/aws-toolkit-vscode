// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.database.dataSource.DatabaseConnectionConfig
import com.intellij.database.dataSource.DatabaseConnectionPoint

abstract class AwsAuthWidget(userFieldEnabled: Boolean = true) : @Suppress("DEPRECATION") AwsAuthWidgetBase(userFieldEnabled) {
    override fun save(config: DatabaseConnectionConfig, copyCredentials: Boolean) {
        super.save(config, copyCredentials)
        save(config.dataSource, copyCredentials)
    }

    override fun reset(point: DatabaseConnectionPoint, resetCredentials: Boolean) {
        super.reset(point, resetCredentials)
        reset(point.dataSource, resetCredentials)
    }
}
