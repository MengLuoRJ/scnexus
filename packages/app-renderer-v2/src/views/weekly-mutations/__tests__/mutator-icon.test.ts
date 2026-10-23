import { expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import MutatorIcon from '../components/MutatorIcon.vue'

test('layers a local factor icon beneath the supplied decorative frame', () => {
  const wrapper = mount(MutatorIcon, { props: { id: 'laser-drill' } })
  expect(wrapper.find('.mutator-icon-image').attributes('src')).toMatch(
    /mutators\/laser-drill\.png$/,
  )
  expect(wrapper.find('.mutator-icon-frame').attributes('src')).toMatch(
    /mutators\/Ui_coop_ingame_mutatorframe\.webp$/,
  )
  expect(wrapper.attributes('aria-hidden')).toBe('true')
  wrapper.unmount()
})
test('falls back on missing images, resets for another factor and rejects path traversal', async () => {
  const wrapper = mount(MutatorIcon, { props: { id: 'laser-drill' } })
  await wrapper.find('.mutator-icon-image').trigger('error')
  expect(wrapper.find('.mutator-icon-fallback').exists()).toBe(true)
  await wrapper.setProps({ id: 'concussive-attacks' })
  expect(wrapper.find('.mutator-icon-image').exists()).toBe(true)
  await wrapper.setProps({ id: 'unknown' })
  expect(wrapper.find('.mutator-icon-image').exists()).toBe(false)
  await wrapper.setProps({ id: '../outside' })
  expect(wrapper.find('.mutator-icon-image').exists()).toBe(false)
  expect(wrapper.find('.mutator-icon-frame').exists()).toBe(true)
  wrapper.unmount()
})
