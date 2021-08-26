// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.rules

import org.junit.rules.ExternalResource
import java.util.Properties

/**
 * A utility that can temporarily forcibly set system properties and
 * then allows resetting them to the original values.
 */
class SystemPropertyHelper : ExternalResource() {
    private lateinit var originalProperties: Properties

    override fun before() {
        originalProperties = Properties().apply {
            this.putAll(System.getProperties())
        }
    }

    override fun after() {
        System.setProperties(originalProperties)
    }
}
