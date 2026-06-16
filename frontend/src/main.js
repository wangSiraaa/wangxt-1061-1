import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/dist/locale/zh-cn.mjs';
import 'element-plus/dist/index.css';
import * as ElIcons from '@element-plus/icons-vue';

import App from './App.vue';
import router from './router';
import './styles/global.css';

const app = createApp(App);
const pinia = createPinia();

for (const [key, component] of Object.entries(ElIcons)) {
  app.component(key, component);
}

app.use(pinia);
app.use(router);
app.use(ElementPlus, { locale: zhCn });

app.mount('#app');
