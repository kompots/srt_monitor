<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import Chart from 'chart.js/auto';

import axios from 'axios';
import 'primeicons/primeicons.css'
import Button from "primevue/button"
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import ProgressBar from 'primevue/progressbar';
import FloatLabel from 'primevue/floatlabel';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import ToggleSwitch from 'primevue/toggleswitch';
import Select from 'primevue/select';
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';
import Fluid from 'primevue/fluid';
import InputNumber from 'primevue/inputnumber';
import Message from 'primevue/message';

import Accordion from 'primevue/accordion';
import AccordionPanel from 'primevue/accordionpanel';
import AccordionHeader from 'primevue/accordionheader';
import AccordionContent from 'primevue/accordioncontent';

import Card from 'primevue/card';
import dayjs from 'dayjs';
import OBSWebSocket from 'obs-websocket-js';
import Toast from 'primevue/toast';
import { useToast } from "primevue/usetoast";

const toast = useToast();

const config = ref({
  updateDate: new Date(),
  ws: {
    active: false
  },
  srt: {
    ratio: 1,
    bframes: 3,
  },
  obs: {}
});

const obsWS = new OBSWebSocket();
const obs = ref({});
const scenes = ref([]);
const sources = ref([]);
const wsConnectionActive = ref(false)
const srtConnectionActive = ref(null)
const points = ref([]);
const url = new URL(window.location.href);
const ws = new WebSocket('ws://localhost:3333');
const scene = ref('');
const chartCanvas = ref(null);
const data = {
  labels: [],
  datasets: [{
    label: 'Bitrate (kbps)',
    display: false,
    borderColor: '#34d399',
    backgroundColor: 'rgba(52,211,153,0.2)',
    fill: true,
    pointRadius: 0,
    pointHoverRadius: 0,
    data: [],
  }]
};

let accPanels = ref([1]);
let bFrameCounter = ref(0);
let bitrate = 0;
let chart = null;
let intervalId = null;

ws.onopen = () => {
  wsMessage(JSON.stringify({ method: 'getConfig' }))

};

ws.onmessage = (event) => {
  let _message = JSON.parse(event.data);
  if (_message.method == 'updateConfig') {
    config.value = _message.config
    if (!wsConnectionActive.value && config.value.ws.connected) {
      establishWSConnection(true)
    }
  }
  if (_message.method == 'disconnect') {
    config.value = _message.config
    establishWSConnection(false)
  }

  if (_message.method == 'bitrate') {
    bitrate = _message.bitrate
  }
};

ws.onclose = () => {
  console.log('Disconnected from WebSocket server');
};

const wsMessage = (message) => {
  ws.send(message);
}

onMounted(async () => {
  createChart();
});

onBeforeUnmount(() => {
  if (intervalId) clearInterval(intervalId);
  if (chart) chart.destroy();
});

const disconnect = () => {
  wsMessage(JSON.stringify({ method: 'disconnect', config: config.value }))
}

const toggleSwitcher = (evet) => {
  config.value.ws.active = !config.value.ws.active;
}

const saveToConfig = async () => {
  config.value.updateDate = new Date();
  wsMessage(JSON.stringify({
    method: 'setConfig',
    config: config.value
  }))
  toast.add({ severity: 'success', summary: 'Success', detail: 'Config saved', life: 3000 });
}

const copyUrl = () => {
  const url = `http://${url.hostname}:8000`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url)
      .then(() => {
        toast.add({ severity: 'success', summary: 'Success', detail: 'URL Copied to clipboard', life: 3000 });
      })
      .catch(err => {
        console.error('Failed to copy:', err);
      });
  } else {
    const textarea = document.createElement('textarea');
    textarea.value = url;
    document.body.appendChild(textarea);
    textarea.select(); npm
    try {
      document.execCommand('copy');
      toast.add({ severity: 'success', summary: 'Success', detail: 'URL Copied to clipboard', life: 3000 });
    } catch (err) {
      console.error('Fallback: Copy failed', err);
    }
    document.body.removeChild(textarea);
  }
}

const establishWSConnection = async (type) => {
  if (type) {
    try {
      await obsWS.connect(`ws://${config.value.ws.host}:${config.value.ws.port}`, `${config.value.ws.password}`);
      try {
        const { scenes: sceneList } = await obsWS.call('GetSceneList')
        obs.value.scenes = sceneList;
      } catch (err) {
        toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to retrieve scene list', life: 3000 });
      }
      try {
        const allSourcesMap = new Map();
        for (const scene of obs.value.scenes) {
          const { sceneItems } = await obsWS.call('GetSceneItemList', { sceneName: scene.sceneName });
          for (const item of sceneItems) {
            if (!allSourcesMap.has(item.sourceName)) {
              allSourcesMap.set(item.sourceName, item);
            }
          }
        }
        obs.value.sources = Array.from(allSourcesMap.values());
      } catch (err) {
        toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to retrieve source list', life: 3000 });
      }
      wsConnectionActive.value = true;
      config.value.ws.connected = true;
      accPanels.value.push(2);
      accPanels.value.shift();
      wsMessage(JSON.stringify({ method: 'setConfig', config: config.value }))
      toast.add({ severity: 'success', summary: 'Success', detail: 'Connect to OBS', life: 3000 });
      intervalId = setInterval(fetchAndUpdateData, (config.value.srt.ratio * 1000));
    } catch (err) {
      console.log(err)
      toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to connect to OBS', life: 3000 });
    }
  } else {
    wsConnectionActive.value = false;
    config.value.ws.connected = false;
    try {
      clearInterval(intervalId)
      if (config?.ws?.active) {
        await obsWS.call('SetCurrentProgramScene', { sceneName: config.value.obs.main_scene });
      }
      await obsWS.disconnect();
    } catch (error) {
      console.log(error)
      console.error('Not connected');
    }
  }

};

const isFrameGood = async () => {
  if (config.value.obs.main_scene !== undefined) {
    const result = await obsWS.call('GetSceneItemList', {
      sceneName: config.value.obs.main_scene
    });
    const item = result.sceneItems.find(i => i.sourceName === config.value.obs.source);
    if (item) {
      const transform = await obsWS.call('GetSceneItemTransform', {
        sceneName: config.value.obs.main_scene,
        sceneItemId: item.sceneItemId
      });
      const { width, height, scaleX, scaleY } = transform.sceneItemTransform;
      const actualHeight = height * scaleY;
      if (Math.floor(actualHeight) > 10) {
        return true;
      }
    }
  }
  return false;
}

const doFrameCompare = async (bitrate) => {
  const { currentProgramSceneName } = await obsWS.call('GetCurrentProgramScene');
  scene.value = currentProgramSceneName;
  if (Math.floor(bitrate) < config.value.srt.bitrate || !await isFrameGood()) {
    bFrameCounter.value = (bFrameCounter.value + 1) > config.value.srt.bframes ? config.value.srt.bframes : (bFrameCounter.value + 1);
  } else {
    bFrameCounter.value = (bFrameCounter.value - 1) > 0 ? (bFrameCounter.value - 1) : 0;
  }
  if (bFrameCounter.value == 0) {
    if (config.value.ws?.active && config.value.obs.main_scene !== undefined && scene.value !== config.value.obs.main_scene) {
      await obsWS.call('SetCurrentProgramScene', { sceneName: config.value.obs.main_scene });
    }
  }
  if (bFrameCounter.value >= config.value.srt.bframes) {
    if (!await isFrameGood()) {
      if (config.value.ws?.active && config.value.obs.fallback_scene !== undefined && scene.value !== config.value.obs.fallback_scene) {
        await obsWS.call('SetCurrentProgramScene', { sceneName: config.value.obs.fallback_scene });
      }
    } else {
      if (config.value.ws?.active && config.value.obs.low_scene !== undefined && scene.value !== config.value.obs.low_scene) {
        await obsWS.call('SetCurrentProgramScene', { sceneName: config.value.obs.low_scene });
      }
    }
  }
}

const createChart = () => {
  chart = new Chart(chartCanvas.value, {
    type: 'line',
    data,
    options: {
      plugins: {
        legend: {
          display: false
        }
      },
      animation: false,
      scales: {
        x: {
          title: { display: false, text: 'Time' },
          ticks: {
            display: false
          },
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Bitrate (kbps)' }
        }
      }
    }
  });
}

const fetchAndUpdateData = async () => {
  try {
    wsMessage(JSON.stringify({ method: 'bitrate' }))
    const now = new Date().toLocaleTimeString();
    data.labels.push(now);
    data.datasets[0].data.push(parseFloat(bitrate));
    doFrameCompare(bitrate)
    if (data.labels.length > 60) {
      data.labels.shift();
      data.datasets[0].data.shift();
    }
    chart.update();
  } catch (e) {
    console.error('Failed to fetch bitrate:', e);
  }
}

</script>
<template>
  <Toast />
  <Tabs value="0" class="text-xs">
    <TabList>
      <Tab value="0" as="div" class="flex items-center gap-2">
        <i class="pi pi-sitemap" style="font-size: 1rem"></i>
        <span class="font-bold whitespace-nowrap">Connection</span>
      </Tab>
      <Tab value="1" as="div" class="flex items-center gap-2" :disabled="!wsConnectionActive">
        <i class="pi pi-cog" style="font-size: 1rem"></i>
        <span class="font-bold whitespace-nowrap">Settings</span>
      </Tab>
    </TabList>
    <TabPanels>
      <TabPanel value="0" as="p" class="m-0">

        <Accordion :value="accPanels" multiple>
          <AccordionPanel :value="1" class="pb-4">
            <AccordionHeader>
              Web socket connection
              <!-- <Button class="float-right pt-0 mt-0" v-tooltip.top="'Copy panel url'" icon="pi pi-copy" severity="primary"
              variant="text" @click="copyUrl" rounded aria-label="Filter" /> -->
            </AccordionHeader>
            <AccordionContent>
              <div class="pt-2">
                <div class="flex gap-1">
                  <div class="flex-col size-9/12">
                    <InputGroup>
                      <InputGroupAddon>ws://</InputGroupAddon>
                      <FloatLabel variant="on">
                        <InputText id="ws_host" class="w-full" v-model="config.ws.host" autocomplete="off"
                          :readonly="wsConnectionActive" />
                        <label for="ws_host">Host</label>
                      </FloatLabel>
                    </InputGroup>
                  </div>
                  <div class="flex-col size-3/12">
                    <FloatLabel variant="on">
                      <InputText id="ws_port" class="w-full" v-model="config.ws.port" autocomplete="off"
                        :readonly="wsConnectionActive" />
                      <label for="ws_port">Port</label>
                    </FloatLabel>
                  </div>
                </div>

              </div>
              <div class="pt-2">
                <FloatLabel variant="on">
                  <Password id="ws_password" fluid :toggleMask="true" :feedback="false" v-model="config.ws.password"
                    :disabled="wsConnectionActive" autocomplete="off" />
                  <label for="ws_password">WS password</label>
                </FloatLabel>
              </div>
              <div class="">
                <div class="flex-col">

                  <div class="pt-2 float-right" v-if="wsConnectionActive">
                    <Button icon="pi pi-times-circle" label="Disconnect" severity="danger" variant="text"
                      @click="disconnect()" rounded aria-label="Filter" />
                  </div>
                </div>
                <div>
                  <div class="float-left pt-3">

                  </div>
                  <div class="pt-2 float-right" v-if="!wsConnectionActive">
                    <Button size="small" label="Connect" severity="success" @click="establishWSConnection(true)" />
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionPanel>
          <AccordionPanel :value="2">
            <AccordionHeader>
              Scene automatic control
              <div class="float-left">
                <ToggleSwitch size="small" v-model="empty" @click.stop @change="toggleSwitcher" />
              </div>
            </AccordionHeader>
            <AccordionContent>
              <div class="flex gap-2">
                <div class="w-full">
                  <Fluid>

                    <div style="clear: both;"></div>
                    <div class="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-3 gap-0">
                      <div class="justify-center flex-row text-center">
                        <div>
                          Current bitrate
                        </div>
                        <span v-if="Math.floor(bitrate) >= config.srt.bitrate" class="text-green-500">
                          {{ Math.floor(bitrate) }}
                        </span>
                        <span v-else class="text-red-500">
                          {{ Math.floor(bitrate) }}
                        </span>
                        kbps
                      </div>

                      <div class="justify-center text-center">
                        <div>Current scene</div>
                        <span>{{ scene }}</span>
                      </div>

                      <div class="justify-center text-center">
                        <div>Bad frames</div>
                        <span v-if="bFrameCounter == 0" class="text-green-500">
                          {{ bFrameCounter }} / {{ config.srt.bframes }}
                        </span>
                        <span v-else class="text-red-500">
                          {{ bFrameCounter }} / {{ config.srt.bframes }}
                        </span>
                      </div>
                    </div>
                  </Fluid>

                </div>
              </div>
              <div class="pt-6">
                <canvas ref="chartCanvas" width="600" height="300"></canvas>
              </div>
            </AccordionContent>
          </AccordionPanel>
        </Accordion>


      </TabPanel>

      <TabPanel value="1" as="p" class="m-0">
        <Card>
          <template #title>OBS</template>
          <template #content>
            <div class="">
              <FloatLabel class="w-full" variant="on">
                <Select v-model="config.obs.source" inputId="obs_source" :options="obs.sources" optionLabel="sourceName"
                  optionValue="sourceName" class="w-full" />
                <label for="obs_source">SRT source</label>
              </FloatLabel>
              <div class="pl-1 pt-1 text-gray-500">Media source that displays SRT source</div>
            </div>

            <div class="pt-2">
              <FloatLabel class="w-full" variant="on">
                <Select v-model="config.obs.main_scene" inputId="obs_main_scene" :options="obs.scenes"
                  optionLabel="sceneName" optionValue="sceneName" class="w-full" />
                <label for="obs_main_scene">Main scene</label>
              </FloatLabel>
              <div class="pl-1 pt-1 text-gray-500">Scene to switch to when SRT signal is stable</div>
            </div>

            <div class="pt-2">
              <FloatLabel class="w-full" variant="on">
                <Select v-model="config.obs.fallback_scene" inputId="obs_fallback_scene" :options="obs.scenes"
                  optionLabel="sceneName" optionValue="sceneName" class="w-full" />
                <label for="obs_fallback_scene">Fallback scene</label>
              </FloatLabel>
              <div class="pl-1 pt-1 text-gray-500">Scene to switch to when SRT signal is lost</div>
            </div>

            <div class="pt-2">
              <FloatLabel class="w-full" variant="on">
                <Select v-model="config.obs.low_scene" inputId="obs_low_scene" :options="obs.scenes"
                  optionLabel="sceneName" optionValue="sceneName" class="w-full" />
                <label for="obs_low_scene">Low bitrate scene</label>
              </FloatLabel>
              <div class="pl-1 pt-1 text-gray-500">Scene to switch to when SRT signal is below bitrate threshold but
                active</div>
            </div>

            <div class="pt-2">
              <FloatLabel class="w-full" variant="on">
                <InputNumber v-model="config.srt.ratio" inputId="obs_low_scene" mode="decimal" class="text-xs"
                  showButtons :min="1" :step="1" :max="60" fluid />
                <label for="obs_low_scene">SRT update interval</label>
              </FloatLabel>
              <div class="pl-1 pt-1 text-gray-500">Source check interval in secconds</div>
            </div>

            <div class="pt-2">
              <FloatLabel class="w-full" variant="on">
                <InputNumber v-model="config.srt.bframes" inputId="obs_bframes" mode="decimal" class="text-xs"
                  showButtons :min="1" :step="1" :max="60" fluid />
                <label for="obs_bframes">Bad frames</label>
              </FloatLabel>
              <div class="pl-1 pt-1 text-gray-500">How many bad frames trigger scene switch</div>
            </div>

            <div class="pt-2">
              <FloatLabel class="w-full" variant="on">
                <InputNumber v-model="config.srt.bitrate" inputId="obs_bitrate" :useGrouping="false" class="text-xs"
                  :step="1" fluid />
                <label for="obs_bitrate">Bitrate treshold (kbps)</label>
              </FloatLabel>
              <div class="pl-1 pt-1 text-gray-500">How many bad frames trigger scene switch</div>
            </div>

            <div class="pt-2 float-right">
              <Button size="small" label="Save" severity="success" @click="saveToConfig" />
            </div>
          </template>
        </Card>
      </TabPanel>
    </TabPanels>
  </Tabs>
</template>
