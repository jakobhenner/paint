<template>
  <div id="app">
    <paint ref="paint" v-bind="props" />
  </div>
</template>

<script>
import dat from 'dat.gui'
import Paint from './components/Paint'

import props, { getDefaultProps } from '@/js/props'

export default {
  name: 'App',
  components: {
    Paint
  },
  data () {
    const defaults = {
      ...getDefaultProps(),
      clear: () => {
        this.$refs.paint.clear()
      }
    }

    const overrides = {
      fluidity: 0.9,
      brushScale: 0.4,
      splatVelocityScale: 5.9,
      roughness: 0,
      f0: 4.6,
      normalScale: 5.5,
      diffuseScale: 0,
      specularScale: 1.06,
      lightDirection: [-1, -1.6, -0.1],
      color: [0.9, 2.2, 1, 0.2]
    }

    const props = {...defaults, ...overrides}

    return {
      props
    }
  },
  mounted () {
    this.gui = new dat.GUI();

    this.gui.addColor(this.props, 'color')

    this.gui.add(this.props, 'fluidity', 0.2, 0.9)
    this.gui.add(this.props, 'bristleCount', 0, 1)
    this.gui.add(this.props, 'brushScale', 0, 1)
    this.gui.add(this.props, 'brushHeight', 0, 4.5)
    this.gui.add(this.props, 'splatVelocityScale', 0, 10)
    this.gui.add(this.props, 'splatRadius', 0, 0.5)


    this.gui.add(this.props, 'roughness', 0, 1)
    this.gui.add(this.props, 'f0', 0, 10)
    this.gui.add(this.props, 'normalScale', 0, 10)
    this.gui.add(this.props, 'diffuseScale', 0, 10)
    this.gui.add(this.props, 'specularScale', 0, 10)
    //this.gui.add(this.props, 'lightDirection', 0, 10)

    const lightDirection = this.gui.addFolder("lightDirection");
    Object.keys(this.props.lightDirection).forEach((key) => {
      lightDirection.add(this.props.lightDirection, key, -3, 3);
    });

    this.gui.add(this.props, 'minBristleCount', 1, 100, 1)
    this.gui.add(this.props, 'maxBristleCount', 1, 100, 1)
    this.gui.add(this.props, 'minBrushScale', 1, 1000, 1)
    this.gui.add(this.props, 'maxBrushScale', 1, 1000, 1)
    this.gui.add(this.props, 'colorModel', {
      natural: 'RYB',
      digital: 'RGB'
    })
    this.gui.add(this.props, 'quality', 0.5, 2, 0.1)
    this.gui.add(this.props, 'clear')
  },
  beforeDestroy () {
    this.gui.destroy()
  }
}
</script>

<style>
body {
  margin: 0;
  padding: 0;
  overflow: hidden;
  user-select: none;
  font-family: -apple-system, Helvetica;
}
</style>
