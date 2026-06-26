// The catalog of installable practice maps, shared by the installer (main) and
// the map picker (renderer). Each is a zipped world placed into an instance's
// saves/ folder.

export interface MapDef {
  id: string
  name: string
  url: string
}

export const MAP_CATALOG: MapDef[] = [
  {
    id: 'portal',
    name: 'Portal Practice',
    url: 'https://github.com/Semperzz/Portal-Practice/releases/download/v2.8/Portal.Practice.v2.zip'
  },
  {
    id: 'zero',
    name: 'Zero Practice',
    url: 'https://github.com/Mescht/Zero-Practice/releases/download/v1.2.2/Zero.Practice.v1.2.2.zip'
  },
  {
    id: 'mcsr',
    name: 'MCSR Practice',
    url: 'https://github.com/Dibedy/The-MCSR-Practice-Map/releases/download/latest/MCSR.Practice.v2.0.0.zip'
  },
  {
    id: 'crafting',
    name: 'Crafting Practice',
    url: 'https://github.com/Semperzz/Crafting-Practice-v2/releases/download/v2.1/Crafting.Practice.v2.zip'
  },
  {
    id: 'bastion',
    name: 'Llama Bastion Practice',
    url: 'https://github.com/LlamaPag/bastion/releases/download/3.15.0/LBP.3.15.0.zip'
  }
]

export const ALL_MAP_IDS: string[] = MAP_CATALOG.map((m) => m.id)
