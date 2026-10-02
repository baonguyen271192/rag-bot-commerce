import { useOutletContext } from 'react-router-dom'
import ChannelsTab from '../../components/ChannelsTab'

export default function StoreChannelsPage() {
  const { store, reload } = useOutletContext()
  return <ChannelsTab store={store} onChanged={reload} />
}
