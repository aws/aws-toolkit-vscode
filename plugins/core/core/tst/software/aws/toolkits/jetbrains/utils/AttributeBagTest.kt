// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.aws.toolkits.core.utils.AttributeBag
import software.aws.toolkits.core.utils.AttributeBagKey

@Suppress("UNCHECKED_CAST")
class AttributeBagTest {
    @Test
    fun createAndRetrieveValuesWorks() {
        val bag = AttributeBag()
        val key = AttributeBagKey.create<String>("1234567890")
        bag.putData(key, "abc")
        assertThat(bag.get(key)).isEqualTo("abc")
    }

    @Test
    fun getNonexistentValueIsNull() {
        val bag = AttributeBag()
        val key = AttributeBagKey.create<String>("hjkl")
        assertThat(bag.get(key)).isNull()
    }

    @Test
    fun replacingValuesWorks() {
        val bag = AttributeBag()
        val key = AttributeBagKey.create<String>("23456754")
        bag.putData(key, "abc")
        bag.putData(key, "cdf")
        assertThat(bag.get(key)).isEqualTo("cdf")
    }

    @Test
    fun creatingTheSameValueIsIdempotent() {
        assertThat(AttributeBagKey.create<String>("fail")).isSameAs(AttributeBagKey.create<String>("fail"))
    }

    @Test(expected = NoSuchElementException::class)
    fun getOrThrowThrowsOnFailure() {
        val bag = AttributeBag()
        val key = AttributeBagKey.create<String>("asdf")
        bag.getOrThrow(key)
    }
}
