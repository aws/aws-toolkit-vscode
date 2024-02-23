// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.parser

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.aws.toolkits.core.lambda.LambdaManifestValidator

class LambdaManifestValidatorTest {

    @Test
    fun `manifest xml file parsing succeeds`() {
        LambdaManifestValidatorTest::class.java.getResourceAsStream("/xmlSampleSuccess.xml").use {
            assertThat(LambdaManifestValidator.canBeParsed(it)).isTrue
        }
    }

    @Test
    fun `manifest xml file parsing fails`() {
        LambdaManifestValidatorTest::class.java.getResourceAsStream("/xmlSampleFailure.xml").use {
            assertThat(LambdaManifestValidator.canBeParsed(it)).isFalse
        }
    }
}
