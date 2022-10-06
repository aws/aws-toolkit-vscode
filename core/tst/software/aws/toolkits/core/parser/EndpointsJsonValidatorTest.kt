// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.parser

import junit.framework.TestCase.assertFalse
import junit.framework.TestCase.assertTrue
import org.junit.Test
import software.aws.toolkits.core.region.EndpointsJsonValidator

class EndpointsJsonValidatorTest {
    @Test
    fun isJsonParse() {
        EndpointsJsonValidatorTest::class.java.getResourceAsStream("/jsonSampleSuccess.json").use {
            assertTrue(EndpointsJsonValidator.canBeParsed(it))
        }
    }
    @Test
    fun isJsonParseFail() {
        EndpointsJsonValidatorTest::class.java.getResourceAsStream("/jsonSampleFailure.json").use {
            assertFalse(EndpointsJsonValidator.canBeParsed(it))
        }
    }
}
