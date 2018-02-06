package software.aws.toolkits.jetbrains.utils

class MutableMapWithListener<K, V> : MutableMap<K, V> {
    private val delegate: MutableMap<K, V> = mutableMapOf()
    private val listeners: MutableList<MapChangeListener<K, V>> = mutableListOf()

    override val size: Int
        get() = delegate.size

    override fun containsKey(key: K): Boolean = delegate.containsKey(key)

    override fun containsValue(value: V): Boolean = delegate.containsValue(value)

    override fun get(key: K): V? = delegate.get(key)

    override fun isEmpty(): Boolean = delegate.isEmpty()

    override val entries: MutableSet<MutableMap.MutableEntry<K, V>>
        get() = delegate.entries

    override val keys: MutableSet<K>
        get() = delegate.keys

    override val values: MutableCollection<V>
        get() = delegate.values

    override fun clear() {
        delegate.clear()
        listeners.forEach { it.onClear() }
    }

    override fun put(key: K, value: V): V? {
        val previousValue = delegate.put(key, value)
        listeners.forEach { it.onPut(key, value, previousValue) }
        return previousValue
    }

    override fun putAll(from: Map<out K, V>) {
        delegate.putAll(from)
        listeners.forEach { it.onPutAll(from) }
    }

    override fun remove(key: K): V? {
        val previousValue = delegate.remove(key)
        listeners.forEach { it.onRemove(key, previousValue) }
        return previousValue
    }

    fun addListener(listener: MapChangeListener<K, V>) {
        listeners.add(listener)
    }

    fun removeListener(listener: MapChangeListener<K, V>) {
        listeners.remove(listener)
    }

    interface MapChangeListener<K, V> {
        fun onUpdate()

        fun onClear() {
            onUpdate()
        }

        fun onPut(key: K, value: V, previousValue: V?) {
            onUpdate()
        }

        fun onPutAll(from: Map<out K, V>) {
            onUpdate()
        }

        fun onRemove(key: K, value: V?) {
            onUpdate()
        }
    }
}