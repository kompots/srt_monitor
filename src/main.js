import { createApp } from 'vue';
import './assets/main.css';
import App from './App.vue';
import PrimeVue from 'primevue/config';
import Aura from '@primeuix/themes/aura';
import Chart from 'primevue/chart';
import 'chartjs-adapter-date-fns';
import Tooltip from 'primevue/tooltip';
import ToastService from 'primevue/toastservice';

const app = createApp(App);

app.use(PrimeVue, {
    theme: {
        preset: Aura
    }
}).use(ToastService);
app.component('Chart', Chart);
app.directive('tooltip', Tooltip);
app.mount('#app');
