// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.caws

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test

class ParameterDescriptionsTest {
    @Test
    fun `parameter descriptions json can be loaded`() {
        assertThat(loadParameterDescriptions().environmentParameters.instanceTypes).isNotEmpty
    }
}
