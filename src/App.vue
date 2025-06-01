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
import MeterGroup from 'primevue/metergroup';
import Accordion from 'primevue/accordion';
import AccordionPanel from 'primevue/accordionpanel';
import AccordionHeader from 'primevue/accordionheader';
import AccordionContent from 'primevue/accordioncontent';


import Stepper from 'primevue/stepper';
import StepList from 'primevue/steplist';
import StepPanels from 'primevue/steppanels';
import StepItem from 'primevue/stepitem';
import Step from 'primevue/step';
import StepPanel from 'primevue/steppanel';

import Card from 'primevue/card';
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
    bitrate: 700
  },
  obs: {}
});
const forceScene = ref(null);
const obsWS = new OBSWebSocket();
const obs = ref({});
const scenes = ref([]);
const sources = ref([]);
const wsConnectionActive = ref(true)
const srtConnectionActive = ref(null)
const points = ref([]);
const url = new URL(window.location.href);
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
let totalPercent = ref(0);
let accPanels = ref([1]);
let bFrameCounter = ref(0);
let bitrate = ref(0);
let chart = null;
let intervalId = null;
let ws = null;
let srtSource = null;

const initSockets = () => {
  console.log("initSockets call")

  ws.onerror = (error) => {
    console.error("WebSocket error", error);
  };

  ws.onmessage = (event) => {
    let _message = JSON.parse(event.data);
    if (_message.method == 'syncConfig') {
      console.log("Received configuration sync")
      config.value = _message.config
      localStorage.setItem('config', JSON.stringify(config.value));
    }
    if (_message.method == 'updateConfig') {
      config.value = _message.config
      if (!wsConnectionActive.value && config.value.ws.connected) {
        establishWSConnection(true)
      }
      localStorage.setItem('config', JSON.stringify(config.value));
    }
    if (_message.method == 'disconnect') {
      config.value = _message.config
      establishWSConnection(false)
    }

    if (_message.method == 'bitrate') {
      bitrate = ref(Math.floor(_message.bitrate))
    }
  };

  ws.onclose = () => {
    console.log('Disconnected from WebSocket server');
  };

}

const wsMessage = (message) => {
  ws.send(message);
}

onMounted(async () => {
  if (localStorage.getItem('config')) {
    config.value = JSON.parse(localStorage.getItem('config'));
  }
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
  localStorage.setItem('config', JSON.stringify(config.value));
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

const delay = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const establishWSConnection = async (type) => {
  if (type) {
    try {
      await obsWS.connect(`ws://${config.value.ws.host}:${config.value.ws.port}`, `${config.value.ws.password}`);
      ws = new WebSocket(`ws://${config.value.ws.host}:3333`);
      ws.addEventListener('open', () => {
        initSockets();
      });
      let count = 0;
      while (count < 10 && ws.readyState !== WebSocket.OPEN) {
        count++;
        await delay(100);
      }
      console.log("Send sync call")
      wsMessage(JSON.stringify({ method: 'syncConfig' }));
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
      srtSource = item.sourceUuid
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

const forceSrtReload = async () => {
  const sceneItem = await obsWS.call('GetInputSettings', {
    inputUuid: srtSource
  });
  if (new_input.replace(/refid=[^&?]*/, 'refid=' + Date.now()) == new_input) {
    new_input = new_input + '?refid=' + Date.now();
  } else {
    new_input = new_input.replace(/refid=[^&?]*/, 'refid=' + Date.now();
  }
  await obsWS.call("SetInputSettings", {
    inputUuid: srtSource,
    inputSettings: {
      input: new_input
    },
    overlay: true
  });
}

const doFrameCompare = async (bitrate) => {
  const { currentProgramSceneName } = await obsWS.call('GetCurrentProgramScene');
  scene.value = currentProgramSceneName;
  forceScene.value = scene.value
  if (bitrate < config.value.srt.bitrate || !await isFrameGood()) {
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

const forceSceneChange = async () => {
  console.log("Force switch")
  await obsWS.call('SetCurrentProgramScene', { sceneName: forceScene.value });
}

</script>
<template>
  <Toast />
  <Stepper value="1">
    <div class="p-4">
      <StepList>
        <Step value="1">Connect</Step>
        <Step value="2" :disabled="!wsConnectionActive">Configure</Step>
        <Step value="3" :disabled="!wsConnectionActive">Overview</Step>
      </StepList>
    </div>

    <StepPanels>
      <StepPanel v-slot="{ activateCallback }" value="1">
        <div
          class="border-2 border-dashed border-surface-200 dark:border-surface-700 rounded bg-surface-50 dark:bg-surface-950 text-xs p-2 items-start">
          <div class="pt-2">
            <div class="flex gap-1">
              <div class="flex-col size-9/12">
                <InputGroup>
                  <InputGroupAddon>ws://</InputGroupAddon>
                  <FloatLabel variant="on">
                    <InputText id="ws_host" class="w-full text-xs" v-model="config.ws.host" autocomplete="off"
                      :readonly="wsConnectionActive" />
                    <label for="ws_host">Host</label>
                  </FloatLabel>
                </InputGroup>
              </div>
              <div class="flex-col size-3/12">
                <FloatLabel variant="on">
                  <InputText id="ws_port" class="w-full text-xs" v-model="config.ws.port" autocomplete="off"
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
          <div class="pb-4 pt-2 pl-4">
            <div class="flex-col">
              <div class="pt-2" v-if="wsConnectionActive">
                <Button icon="pi pi-times-circle" label="Disconnect" severity="danger" variant="text"
                  @click="disconnect()" rounded aria-label="Filter" />
              </div>
            </div>
            <div>
              <div class="pt-2" v-if="!wsConnectionActive">
                <Button size="small" label="Connect" severity="success" @click="establishWSConnection(true)" />
              </div>
            </div>
          </div>
        </div>

      </StepPanel>
      <StepPanel v-slot="{ activateCallback }" value="2">
        <div class="flex flex-col">
          <div
            class="border-2 border-dashed border-surface-200 dark:border-surface-700 rounded bg-surface-50 dark:bg-surface-950 text-xs p-2 items-start">
            <div class="flex gap-2 pt-2">
              <div class="w-full">
                <FloatLabel class="w-full" variant="on">
                  <Select v-model="config.obs.source" inputId="obs_source" :options="obs.sources"
                    optionLabel="sourceName" optionValue="sourceName" class="w-full" />
                  <label for="obs_source">SRT source</label>
                </FloatLabel>
                <div class="pl-1 pt-1 text-gray-500">Media source that displays SRT source</div>
              </div>
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

            <div class="pt-4">
              <FloatLabel class="w-full" variant="on">
                <Select v-model="config.obs.low_scene" inputId="obs_low_scene" :options="obs.scenes"
                  optionLabel="sceneName" optionValue="sceneName" class="w-full" />
                <label for="obs_low_scene">Low bitrate scene</label>
              </FloatLabel>
              <div class="pl-1 pt-1 text-gray-500">Scene to switch to when SRT signal is below bitrate threshold but
                active</div>
            </div>

            <div class="pt-4">
              <FloatLabel class="w-full" variant="on">
                <InputNumber v-model="config.srt.ratio" inputId="obs_low_scene" mode="decimal" class="text-xs"
                  showButtons :min="1" :step="1" :max="60" fluid />
                <label for="obs_low_scene">SRT update interval</label>
              </FloatLabel>
              <div class="pl-1 pt-1 text-gray-500">Source check interval in secconds</div>
            </div>

            <div class="pt-4">
              <FloatLabel class="w-full" variant="on">
                <InputNumber v-model="config.srt.bframes" inputId="obs_bframes" mode="decimal" class="text-xs"
                  showButtons :min="1" :step="1" :max="60" fluid />
                <label for="obs_bframes">Bad frames</label>
              </FloatLabel>
              <div class="pl-1 pt-1 text-gray-500">How many bad frames trigger scene switch</div>
            </div>

            <div class="pt-4">
              <FloatLabel class="w-full" variant="on">
                <InputNumber v-model="config.srt.bitrate" inputId="obs_bitrate" :useGrouping="false" class="text-xs"
                  :step="1" fluid />
                <label for="obs_bitrate">Bitrate treshold (kbps)</label>
              </FloatLabel>
              <div class="pl-1 pt-1 text-gray-500">How many bad frames trigger scene switch</div>
            </div>

            <div class="pt-6 pb-4 float-right">
              <Button size="small" label="Save configuration" severity="success" @click="saveToConfig" />
            </div>
          </div>
        </div>
      </StepPanel>
      <StepPanel v-slot="{ activateCallback }" value="3">
        <div
          class="border-2 border-dashed border-surface-200 dark:border-surface-700 rounded bg-surface-50 dark:bg-surface-950 text-xs p-2">
          <div class="flex flex-col">
            <div class="text-xs p-2">
              <div class="flex flex-wrap gap-2">

                <Card class="flex-1 border border-surface shadow-none">
                  <template #content>
                    <div class="flex justify-between gap-8">
                      <div class="flex flex-col gap-1">
                        <span class="text-surface-500 dark:text-surface-400 text-xs">Bitrate</span>
                        <span v-if="bitrate >= config.srt.bitrate" class="text-green-500">
                          {{ bitrate }} kbps
                        </span>
                        <span v-else class="text-red-500">
                          {{ bitrate }} kbps
                        </span>
                      </div>
                      <span class="w-8 h-8 rounded-full inline-flex justify-center items-center text-center"
                        :style="{ backgroundColor: `#51a2ff`, color: '#ffffff' }">
                        <i class="pi pi-chart-bar" />
                      </span>
                    </div>
                  </template>
                </Card>
                <Card class="flex-1 border border-surface shadow-none">
                  <template #content>
                    <div class="flex justify-between gap-8">
                      <div class="flex flex-col gap-1">
                        <span class="text-surface-500 dark:text-surface-400 text-xs">B-frames</span>
                        <span v-if="bFrameCounter == 0" class="font-bold text-green-500">
                          {{ bFrameCounter }} / {{ config.srt.bframes }}
                        </span>
                        <span v-else class="font-bold text-red-500">
                          {{ bFrameCounter }} / {{ config.srt.bframes }}
                        </span>
                      </div>
                      <span class="w-8 h-8 rounded-full inline-flex justify-center items-center text-center"
                        :style="{ backgroundColor: `#fb2c36`, color: '#ffffff' }">
                        <i class="pi pi-thumbs-down-fill" />
                      </span>
                    </div>
                  </template>
                </Card>
                <Card class="flex-1 border border-surface shadow-none">
                  <template #content>
                    <div class="flex justify-between gap-8">
                      <div class="flex flex-col gap-1">
                        <span class="text-surface-500 dark:text-surface-400 text-xs">Current scene</span>
                        <span class="font-bold text-xs">{{ scene || 'Not connected' }}</span>
                      </div>
                      <span class="w-8 h-8 rounded-full inline-flex justify-center items-center text-center"
                        :style="{ backgroundColor: `#ff6900`, color: '#ffffff' }">
                        <i class="pi pi-video" />
                      </span>
                    </div>
                  </template>
                </Card>
              </div>
              <div class="pt-2">
                <Card class="flex-4 border border-surface shadow-none">
                  <template #content>
                    <div class="flex justify-between gap-8">
                      <div class="flex flex-col gap-1">
                        <span class="text-surface-500 dark:text-surface-400 text-xs">Auto scene switch</span>
                        <div class="font-bold text-xs flex gap-2">
                          <div class="pt-1">Disabled</div>
                          <ToggleSwitch size="small" v-model="empty" @click.stop @change="toggleSwitcher" />
                          <div class="pt-1">Enabled</div>
                        </div>
                      </div>
                      <span class="w-8 h-8 rounded-full inline-flex justify-center items-center text-center"
                        :style="{ backgroundColor: `#34d399`, color: '#ffffff' }">
                        <i class="pi pi-power-off" />
                      </span>
                    </div>
                  </template>
                </Card>
              </div>


              <div class="pt-4">
                <canvas ref="chartCanvas" width="600" height="300"></canvas>
              </div>
              <div class="flex justify-between pt-4">
                <div class="pr-4 w-full">
                  <FloatLabel variant="on">
                    <Select v-model="forceScene" @click.stop inputId="forceScene" :disabled="config?.ws?.active"
                      :options="obs.scenes" optionLabel="sceneName" optionValue="sceneName" class="w-full"
                      @change="forceSceneChange()" />
                    <label for="obs_source">Force scene</label>
                  </FloatLabel>
                </div>
                <div class="">
                  <Button size="small" class="w-30"
                    :disabled="(config.obs.source === undefined || config.obs.main_scene === undefined)"
                    label="Reload SRT" severity="warn" @click="forceSrtReload()" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </StepPanel>
    </StepPanels>
  </Stepper>





</template>
