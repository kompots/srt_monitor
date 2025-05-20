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

import Select from 'primevue/select';
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';

import InputNumber from 'primevue/inputnumber';
import Message from 'primevue/message';

import Card from 'primevue/card';
import dayjs from 'dayjs';
import OBSWebSocket from 'obs-websocket-js';
import Toast from 'primevue/toast';
import { useToast } from "primevue/usetoast";

const toast = useToast();

const config = ref({
  ws: {},
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
const wsConnectionActive = ref(null)
const srtConnectionActive = ref(null)
const points = ref([]);

let bFrameCounter = 0;
onMounted(async () => {
  const configStr = localStorage.getItem('config');
    if (configStr) {
      try {
        config.value = JSON.parse(configStr);
      } catch (error) {
        console.error('Failed to parse config JSON:', error);
      }
    } else {
      console.log('No config found in localStorage');
    }

    createChart();
});

onBeforeUnmount(() => {
  if (intervalId) clearInterval(intervalId);
  if (chart) chart.destroy();
});

const copyUrl = () => {
  const url = 'http://localhost:3001';
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url)
      .then(() => {
        toast.add({ severity: 'success', summary: 'Success', detail: 'URL Copied to clipboard', life: 3000 });
      })
      .catch(err => {
        console.error('Failed to copy:', err);
      });
  } else {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = url;
    document.body.appendChild(textarea);
    textarea.select();npm
    try {
      document.execCommand('copy');
      toast.add({ severity: 'success', summary: 'Success', detail: 'URL Copied to clipboard', life: 3000 });
    } catch (err) {
      console.error('Fallback: Copy failed', err);
    }
    document.body.removeChild(textarea);
  }
}

const saveToConfig = async () => {
  localStorage.setItem('config', JSON.stringify(config.value));
  toast.add({ severity: 'success', summary: 'Success', detail: 'Config saved', life: 3000 });
}

const establishWSConnection = async (type) => {
   if(type){
      try {
          await obsWS.connect(`ws://${config.value.ws.host}:${config.value.ws.port}`, `${config.value.ws.password}`);
            wsConnectionActive.value = true;
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
        intervalId = setInterval(fetchAndUpdateData, (config.value.srt.ratio * 1000));
        } catch (err) {
          toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to connect to OBS', life: 2500 });
        }
   } else {
    try {
      wsConnectionActive.value = false;
      clearInterval(intervalId)
      await obsWS.call('SetCurrentProgramScene', { sceneName: config.value.obs.main_scene });
      await obsWS.disconnect();
    } catch (error) {
      console.error('Not connected');
    }
   }

};

const doFrameCompare = async (bitrate) => {
  if(Math.floor(bitrate)<config.value.srt.bitrate){
    bFrameCounter = (bFrameCounter + 1) > 3 ? 3 : (bFrameCounter + 1);
  } else {
    bFrameCounter = (bFrameCounter - 1) > 0 ? (bFrameCounter - 1) : 0;
  }

    console.log("B frames: ", bFrameCounter)
    let low = false;
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
      if(Math.floor(actualHeight) > 10){
        low = true;
      }
    }
  if(bFrameCounter == 0 ){
    await obsWS.call('SetCurrentProgramScene', { sceneName: config.value.obs.main_scene });
  }
  if(bFrameCounter > 2 ){
    if(!low){
        await obsWS.call('SetCurrentProgramScene', { sceneName: config.value.obs.fallback_scene });
    } else {
        await obsWS.call('SetCurrentProgramScene', { sceneName: config.value.obs.low_scene });
    }
  }
}

const chartCanvas = ref(null);
let chart = null;
let intervalId = null;

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

function createChart() {
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

async function fetchAndUpdateData() {
  try {
    const res = await fetch('http://localhost:3003/bitrate');
    const json = await res.json();
    const now = new Date().toLocaleTimeString();

    data.labels.push(now);
    data.datasets[0].data.push(parseFloat(json.bitrate));
    doFrameCompare(json.bitrate)
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
            <Card>
                <template #title>Web socket connection
                  <Button class="float-right pt-0 mt-0" v-tooltip.top="'Copy panel url'" icon="pi pi-copy" severity="primary" variant="text" @click="copyUrl" rounded aria-label="Filter" />
                </template>
                <template #content>
                    <div class="pt-2">
                      <div class="flex gap-1">
                        <div class="flex-col size-10/12">
                        <InputGroup>
                          <InputGroupAddon>ws://</InputGroupAddon>
                          <FloatLabel variant="on">
                            <InputText id="ws_host" class="w-full" v-model="config.ws.host" autocomplete="off" :readonly="wsConnectionActive" />
                            <label for="ws_host">Host</label>
                          </FloatLabel>
                        </InputGroup>
                        </div>
                        <div class="flex-col size-2/12">
                          <FloatLabel variant="on">
                            <InputText id="ws_port" class="w-full" v-model="config.ws.port" autocomplete="off" :readonly="wsConnectionActive" />
                            <label for="ws_port">Port</label>
                          </FloatLabel>
                        </div>
                      </div>

                    </div>
                    <div class="pt-2">
                      <FloatLabel variant="on">
                          <Password id="ws_password" fluid :toggleMask="true" :feedback="false" v-model="config.ws.password" :disabled="wsConnectionActive" autocomplete="off" />
                          <label for="ws_password">WS password</label>
                      </FloatLabel>
                    </div>
                    <div class="">
                      <div class="flex-col">
                        <div class="pt-2 float-left" v-if="wsConnectionActive">
                          <div class="pb-1 pt-2">Connection active & receiving data</div>
                        </div>
                        <div class="pt-2 float-right" v-if="wsConnectionActive">
                          <Button icon="pi pi-times-circle" severity="danger" variant="text" @click="establishWSConnection(false)" rounded aria-label="Filter" />
                        </div>
                      </div>
                      <div class="pt-2 flex float-right" v-if="!wsConnectionActive">
                        <Button size="small" label="Connect" severity="success" @click="establishWSConnection(true)"/>
                      </div>
                    </div>
                </template>
            </Card>

            <Card>
                <template #title>Traffic bitrate</template>
                <template #content>
                  <div class="flex gap-2">
                      <div class="w-full">
                        <div class="pt-2 pb-2" v-if="wsConnectionActive">Bitrate throughput</div>
                         <ProgressBar v-if="wsConnectionActive" mode="indeterminate" style="height: 6px"></ProgressBar>
                      </div>
                  </div>
                  <div class="pt-6">
                    <canvas ref="chartCanvas" width="600" height="300"></canvas>
                  </div>
                </template>
            </Card>

          </TabPanel>

          <TabPanel value="1" as="p" class="m-0">
            <Card>
                <template #title>OBS</template>
                <template #content>
                    <div class="pt-2">
                      <FloatLabel class="w-full" variant="on">
                          <Select v-model="config.obs.source" inputId="obs_source" :options="obs.sources" optionLabel="sourceName" optionValue="sourceName" class="w-full" />
                          <label for="obs_source">SRT source</label>
                      </FloatLabel>
                      <div class="pl-1 pt-1 text-gray-500">Media source that displays SRT source</div>
                    </div>

                    <div class="pt-2">
                      <FloatLabel class="w-full" variant="on">
                          <Select v-model="config.obs.main_scene" inputId="obs_main_scene" :options="obs.scenes" optionLabel="sceneName" optionValue="sceneName" class="w-full" />
                          <label for="obs_main_scene">Main scene</label>
                      </FloatLabel>
                      <div class="pl-1 pt-1 text-gray-500">Scene to switch to when SRT signal is stable</div>
                    </div>

                    <div class="pt-2">
                      <FloatLabel class="w-full" variant="on">
                          <Select v-model="config.obs.fallback_scene" inputId="obs_fallback_scene" :options="obs.scenes" optionLabel="sceneName" optionValue="sceneName" class="w-full" />
                          <label for="obs_fallback_scene">Fallback scene</label>
                      </FloatLabel>
                      <div class="pl-1 pt-1 text-gray-500">Scene to switch to when SRT signal is lost</div>
                    </div>

                    <div class="pt-2">
                      <FloatLabel class="w-full" variant="on">
                          <Select v-model="config.obs.low_scene" inputId="obs_low_scene" :options="obs.scenes" optionLabel="sceneName" optionValue="sceneName" class="w-full" />
                          <label for="obs_low_scene">Low bitrate scene</label>
                      </FloatLabel>
                      <div class="pl-1 pt-1 text-gray-500">Scene to switch to when SRT signal is below bitrate threshold but active</div>
                    </div>

                    <div class="pt-2">
                      <FloatLabel class="w-full" variant="on">
                          <InputNumber v-model="config.srt.ratio" inputId="obs_low_scene" mode="decimal" class="text-xs" showButtons :min="1" :step="1" :max="60" fluid />
                          <label for="obs_low_scene">SRT update interval</label>
                      </FloatLabel>
                      <div class="pl-1 pt-1 text-gray-500">Source check interval in secconds</div>
                    </div>

                    <div class="pt-2">
                      <FloatLabel class="w-full" variant="on">
                          <InputNumber v-model="config.srt.bframes" inputId="obs_bframes" mode="decimal" class="text-xs" showButtons :min="1" :step="1" :max="60" fluid />
                          <label for="obs_bframes">Bad frames</label>
                      </FloatLabel>
                      <div class="pl-1 pt-1 text-gray-500">How many bad frames trigger scene switch</div>
                    </div>

                    <div class="pt-2">
                      <FloatLabel class="w-full" variant="on">
                          <InputNumber v-model="config.srt.bitrate" inputId="obs_bitrate" :useGrouping="false" class="text-xs" :step="1" fluid />
                          <label for="obs_bitrate">Bitrate treshold (kbps)</label>
                      </FloatLabel>
                      <div class="pl-1 pt-1 text-gray-500">How many bad frames trigger scene switch</div>
                    </div>

                    <div class="pt-2 float-right">
                      <Button size="small" label="Save" severity="success"  @click="saveToConfig"/>
                    </div>
                </template>
            </Card>
          </TabPanel>
      </TabPanels>
  </Tabs>
</template>
