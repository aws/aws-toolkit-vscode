// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.parser

import junit.framework.TestCase.assertFalse
import junit.framework.TestCase.assertTrue
import org.junit.Test
import software.aws.toolkits.core.lambda.LambdaManifestValidator

class LambdaManifestValidatorTest {

    @Test
    fun isXmlParsing() {
        LambdaManifestValidatorTest::class.java.getResourceAsStream("/xmlSampleSuccess.xml").use {
            assertTrue(LambdaManifestValidator.canBeParsed(it))
        }
    }
    @Test
    fun isXmlParseFail() {
        LambdaManifestValidatorTest::class.java.getResourceAsStream("/xmlSampleFailure.xml").use {
            assertFalse(LambdaManifestValidator.canBeParsed(it))
        }
    }
}
