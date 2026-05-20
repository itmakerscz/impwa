const { defineComponent } = Vue;

export default defineComponent({
    props: ['unassignedOrders', 'couriers', 'routes', 'selectedOrderIds'],
    emits: ['create-route', 'toggle-order-selection', 'complete-route'],
    methods: {
        getRouteQrData(route) {
            const data = {
                r: route.id,
                c: route.courierName,
                s: route.orders.map(o => ({ a: o.address, t: o.phone, i: o.item }))
            };
            return JSON.stringify(data);
        }
    },
    template: `
        <section class="card">
            <h3>🗺️ Logistika a expedice tras</h3>
            <p>Hotová jídla připravená k odběru: <b>{{ unassignedOrders.length }} ks</b></p>

            <div v-if="unassignedOrders.length > 0" class="unassigned-selection-area">
                <p class="selection-hint">Vyberte objednávky pro trasu:</p>
                <div class="order-selection-list">
                    <div v-for="order in unassignedOrders" :key="order.id" 
                         @click="$emit('toggle-order-selection', order.id)"
                         class="selection-item"
                         :class="{ 'is-selected': selectedOrderIds.includes(order.id) }">
                        <input type="checkbox" :checked="selectedOrderIds.includes(order.id)">
                        <b>#{{ order.id }}</b> — {{ order.item }} — <small>{{ order.address }}</small>
                    </div>
                </div>
            </div>
            
            <div class="courier-grid">
                <div v-for="courier in couriers" :key="courier.id" class="courier-card">
                    <h5>🚚 {{ courier.name }}</h5>
                    <p>Stav: <span class="status-active">{{ courier.status }}</span></p>
                    <button @click="$emit('create-route', courier)" :disabled="selectedOrderIds.length === 0" class="btn-generate-route">
                        🗺️ Generovat trasu ({{ selectedOrderIds.length }})
                    </button>
                </div>
            </div>

            <div v-if="routes.length > 0" class="active-routes-section">
                <h4>🚀 Aktivní trasy a doručení</h4>
                <div v-for="route in routes" :key="route.id" class="route-display-card">
                    <div class="route-display-header">
                        <div>
                            <b class="route-id-label">Trasa #{{ route.id }}</b>
                            <div class="route-courier-info">🚚 Kurýr: <b>{{ route.courierName }}</b></div>
                        </div>
                        <button @click="$emit('complete-route', route.id)" class="action-btn-success btn-finish-route">
                            ✅ Doručeno
                        </button>
                    </div>
                    
                    <div class="route-display-body">
                        <div class="route-orders-list">
                            <div v-for="order in route.orders" :key="order.id" class="route-order-item">
                                <div class="order-info-text">
                                    <div class="order-main-detail">#{{ order.id }} - {{ order.item }}</div>
                                    <div class="order-address-detail">📍 {{ order.address }}</div>
                                </div>
                                <div class="order-action-links">
                                    <a :href="'tel:' + order.phone" class="action-btn-success link-call">📞</a>
                                    <a :href="'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(order.address)" target="_blank" class="nav-btn link-nav">📍</a>
                                </div>
                            </div>
                        </div>
                        <div class="route-qr-panel">
                            <img :src="'https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=' + encodeURIComponent(getRouteQrData(route))" alt="QR Trasa">
                            <div class="qr-hint">SKEN PRO MOBIL</div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `
});