// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils.test

import org.assertj.core.api.IterableAssert
import org.assertj.core.api.ListAssert
import org.assertj.core.api.ObjectAssert

@Suppress("UNCHECKED_CAST")
val <T : Any> ObjectAssert<T?>.notNull: ObjectAssert<T>
    get() = this.isNotNull as ObjectAssert<T>

@Suppress("UNCHECKED_CAST")
inline fun <reified SubType : Any> IterableAssert<*>.hasOnlyElementsOfType(): IterableAssert<SubType> =
    hasOnlyElementsOfType(SubType::class.java) as IterableAssert<SubType>

@Suppress("UNCHECKED_CAST")
inline fun <reified SubType : Any> ListAssert<*>.hasOnlyOneElementOfType(): ObjectAssert<SubType> =
    (hasOnlyElementsOfType(SubType::class.java) as ListAssert<SubType>).singleElement()
