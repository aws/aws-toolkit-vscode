package com.amazonaws.intellij.core.region

/**
 * Created by zhaoxiz on 7/24/17.
 */
interface AwsRegionChangeListener {
    fun onCurrentRegionChanged(oldValue: String, newValue: String)
}