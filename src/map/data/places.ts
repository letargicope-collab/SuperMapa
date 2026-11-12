// Foto institucional da sede (embutida em headquarters-photo.ts).
import headquartersPhoto from './headquarters-photo'
import { OFFICE_PHOTOS } from './office-photos'

/**
 * Fotos por unidade (padrão NomeDaCidade_Rua, ex.: São_Bento_liberato,
 * Olho_centro), embutidas em `office-photos.ts` a partir de `public/fotos/`.
 * Se uma chave não existir, o cartão usa a foto institucional como reserva.
 */
const foto = (key: string): string => OFFICE_PHOTOS[key] ?? headquartersPhoto

export type Place = {
  id: string
  name: string
  city: string
  state: string
  uf: 'AL' | 'SE' | 'PE'
  unitType: string
  address: string
  phone: string
  /** Ponto de referência informado pela empresa (mostrado em "Mais detalhes"). */
  reference?: string
  isHeadquarters?: boolean
  /** Coordenadas geográficas reais no formato [longitude, latitude] (WGS84) */
  coordinates: [number, number]
  /** Foto institucional da sede. Não representa a fachada de cada filial. */
  photo: string
}

/**
 * Endereços conforme a lista oficial enviada pela Super Connect.
 *
 * Coordenadas verificadas em 2025 com OpenStreetMap/Nominatim (busca direta do
 * endereço e geocodificação reversa para confirmar o município). A API do
 * Google Maps não é acessível sem chave; os pontos do Google podem diferir em
 * poucos metros, sobretudo na numeração das casas.
 *
 * Coordenadas aproximadas (rua/número não localizados no OpenStreetMap):
 *  - Maravilha: centro do município;
 *  - Arapiraca Express: Rua Brasília, junto à Caixa Econômica;
 *  - Brasília (Lagarto): Estrada do Grupo;
 *  - Colônia 13: Praça Santa Luzia, Colônia Treze;
 *  - ESC Super Ponta da Terra: Rua Domingos Lordsleen (número não mapeado).
 *
 * Olho d'Água das Flores permanece com uma única unidade (sede/matriz, na
 * AL-220), conforme orientação posterior à lista: o ponto da Rua São Francisco,
 * 312 não foi recriado.
 */
export const PLACES: Place[] = [
  {
    id: 'sede-matriz-olho-dagua-das-flores',
    name: "Olho d'Água das Flores — Sede/Matriz",
    city: "Olho d'Água das Flores",
    state: 'Alagoas',
    uf: 'AL',
    unitType: 'Sede e Matriz · Alagoas',
    address: 'Rodovia AL-220, Km 90 — Olho d’Água das Flores, AL',
    phone: '0800 710 0004 · (82) 3623-2170',
    isHeadquarters: true,
    coordinates: [-37.28698810685734, -9.541887797610825],
    photo: foto('Matriz')
  },
  {
    id: 'arapiraca-express',
    name: "Arapiraca — Brasília",
    city: 'Arapiraca',
    state: 'Alagoas',
    uf: 'AL',
    unitType: 'Escritório · Alagoas',
    address: 'Rua Brasília, 54 — Bairro Brasília, Arapiraca, AL',
    phone: '0800 710 0004',
    coordinates: [-36.65318103080999, -9.751713790341384],
    reference: 'Em frente à Caixa Econômica Federal',
    photo: foto('Arapiraca_brasilia')
  },
  {
    id: 'arapiraca-sede',
    name: "Arapiraca — Baixa Grande",
    city: 'Arapiraca',
    state: 'Alagoas',
    uf: 'AL',
    unitType: 'Escritório Regional · Alagoas',
    address: 'Rua Expedicionário Brasileiro, 647 — Baixa Grande, Arapiraca, AL',
    phone: '0800 710 0004',
    coordinates: [-36.6738877, -9.7363371],
    photo: foto('Arapiraca_sede')
  },
  {
    id: 'batalha',
    name: "Batalha — Centro",
    city: 'Batalha',
    state: 'Alagoas',
    uf: 'AL',
    unitType: 'Escritório · Alagoas',
    address: 'Rua Isídio de Almeida, 118 — Centro, Batalha, AL',
    phone: '0800 710 0004',
    coordinates: [-37.12683600444726, -9.67441060596787],
    reference: 'Próximo à igreja matriz',
    photo: foto('Batalha_isidio')
  },
  {
    id: 'campo-alegre',
    name: "Campo Alegre — Centro",
    city: 'Campo Alegre',
    state: 'Alagoas',
    uf: 'AL',
    unitType: 'Escritório · Alagoas',
    address: 'Avenida Monsenhor Hildebrando Veríssimo Guimarães, 132 A — Centro, Campo Alegre, AL',
    phone: '0800 710 0004',
    coordinates: [-36.3500792756099, -9.786866531610354],
    reference: 'Em frente ao ponto das vans',
    photo: foto('Campo_monsenhor')
  },
  {
    id: 'canapi',
    name: "Canapi — Centro",
    city: 'Canapi',
    state: 'Alagoas',
    uf: 'AL',
    unitType: 'Escritório · Alagoas',
    address: 'Avenida Joaquim Tetê — Centro, Canapi, AL',
    phone: '0800 710 0004',
    coordinates: [-37.60414390756611, -9.117511789058199],
    reference: 'Ao lado da loja Dual Acessórios e em frente ao trailer de açaí de Bruno',
    photo: foto('Canapi_Joaquim')
  },
  {
    id: 'coruripe',
    name: "Coruripe — Centro",
    city: 'Coruripe',
    state: 'Alagoas',
    uf: 'AL',
    unitType: 'Escritório · Alagoas',
    address: 'Rua Professora Miriam de Castro Lessa, 36 — Centro, Coruripe, AL',
    phone: '0800 710 0004',
    coordinates: [-36.17202321655854, -10.12783200644604],
    reference: 'Rua do bar da curva',
    photo: foto('Coruripe_professora')
  },
  {
    id: 'delmiro-gouveia',
    name: "Delmiro Gouveia — Centro",
    city: 'Delmiro Gouveia',
    state: 'Alagoas',
    uf: 'AL',
    unitType: 'Escritório · Alagoas',
    address: 'Rua da Independência, S/N, próximo ao Restaurante Zucas — Delmiro Gouveia, AL',
    phone: '0800 710 0004',
    coordinates: [-37.9991129, -9.3846136],
    photo: foto('Delmiro_independencia')
  },
  {
    id: 'esc-cidade-universitaria',
    name: "Maceió — Cidade Universitária",
    city: 'Maceió',
    state: 'Alagoas',
    uf: 'AL',
    unitType: 'Escritório de Serviço (ESC) · Maceió',
    address: 'Av. Dr. Fernando Couto Malta — Graciliano / Cidade Universitária, Maceió, AL',
    phone: '0800 710 0004',
    coordinates: [-35.74626658910641, -9.550729039609443],
    reference: 'Em frente à oficina Peças e Serviços',
    photo: foto('Maceio_fernando')
  },
  {
    id: 'esc-super-ponta-da-terra',
    name: "Maceió — Ponta da Terra",
    city: 'Maceió',
    state: 'Alagoas',
    uf: 'AL',
    unitType: 'Escritório de Serviço (ESC) · Maceió',
    address: 'Rua Domingos Lordsleen, 340 — Ponta da Terra, Maceió, AL',
    phone: '0800 710 0004',
    coordinates: [-35.716670, -9.664839],
    photo: headquartersPhoto,
  },
  {
    id: 'girau-do-ponciano',
    name: "Girau do Ponciano — Centro",
    city: 'Girau do Ponciano',
    state: 'Alagoas',
    uf: 'AL',
    unitType: 'Escritório · Alagoas',
    address: 'Rua Dr. José Bento — Centro, Girau do Ponciano, AL',
    phone: '0800 710 0004',
    coordinates: [-36.83082696289636, -9.882254686920554],
    reference: 'No Auto Posto 3M, Box 6',
    photo: foto('Girau_jose')
  },
  {
    id: 'junqueiro',
    name: "Junqueiro — Centro",
    city: 'Junqueiro',
    state: 'Alagoas',
    uf: 'AL',
    unitType: 'Escritório · Alagoas',
    address: 'Rua Joaquim Ferreira, 190 — Centro, Junqueiro, AL',
    phone: '0800 710 0004',
    coordinates: [-36.474044, -9.929135],
    photo: foto('Junqueiro_joaquim')
  },
  {
    id: 'maravilha',
    name: "Maravilha — Centro",
    city: 'Maravilha',
    state: 'Alagoas',
    uf: 'AL',
    unitType: 'Escritório · Alagoas',
    address: 'Rua Ver. Manoel B Alcântara, 75 — Centro, Maravilha, AL',
    phone: '0800 710 0004',
    coordinates: [-37.34990493299598, -9.230555968902035],
    reference: 'Próx. à praça central',
    photo: foto('Maravilha_Manoel')
  },
  {
    id: 'centro-olho-dagua-das-flores',
    name: "Olho d'Água das Flores — Centro",
    city: "Olho d'Água das Flores",
    state: 'Alagoas',
    uf: 'AL',
    unitType: 'Escritório · Alagoas',
    address: 'Rua São Francisco, 312 — Centro, Olho d’Água das Flores, AL',
    phone: '0800 710 0004',
    coordinates: [-37.29345792315289, -9.53520024082666],
    photo: foto('Olho_centro')
  },
  {
    id: 'palmeira-dos-indios',
    name: "Palmeira dos Índios — São Cristóvão",
    city: 'Palmeira dos Índios',
    state: 'Alagoas',
    uf: 'AL',
    unitType: 'Escritório · Alagoas',
    address: 'Rua 15 de Novembro, 365 — São Cristóvão, Palmeira dos Índios, AL',
    phone: '0800 710 0004',
    coordinates: [-36.63445748459984, -9.413126162339283],
    reference: 'Próximo ao estádio do CSE e à escola Graciliano Ramos',
    photo: foto('Palmeira_15')
  },
  {
    id: 'penedo',
    name: "Penedo — Senhor do Bonfim",
    city: 'Penedo',
    state: 'Alagoas',
    uf: 'AL',
    unitType: 'Escritório · Alagoas',
    address: 'Rodovia Mário Freire Leahy, 71 — Senhor do Bonfim, Penedo, AL',
    phone: '0800 710 0004',
    coordinates: [-36.559779141026034, -10.287283452230657],
    reference: 'Em frente à WM Motos',
    photo: foto('Penedo_mario')
  },
  {
    id: 'pindorama-coruripe',
    name: "Coruripe — Pindorama",
    city: 'Coruripe',
    state: 'Alagoas',
    uf: 'AL',
    unitType: 'Escritório · Alagoas',
    address: 'Av. Vereador Venâncio Rocha, 10 — Pindorama, Coruripe, AL',
    phone: '0800 710 0004',
    coordinates: [-36.33699611936992, -10.15477896055828],
    reference: 'Frente ao escritório da Cooperativa Pindorama',
    photo: foto('Coruripe_venancio')
  },
  {
    id: 'piranhas',
    name: "Piranhas — Xingó",
    city: 'Piranhas',
    state: 'Alagoas',
    uf: 'AL',
    unitType: 'Escritório · Alagoas',
    address: 'Centro Comercial Grinaura Miranda, Loja 47 — Xingó, Piranhas, AL',
    phone: '0800 710 0004',
    coordinates: [-37.7627942, -9.6092153],
    photo: foto('Piranhas_Comercial')
  },
  {
    id: 'pao-de-acucar',
    name: "Pão de Açúcar — Centro",
    city: 'Pão de Açúcar',
    state: 'Alagoas',
    uf: 'AL',
    unitType: 'Escritório · Alagoas',
    address: 'Av. Bráulio Cavalcante, S/N — Centro, Pão de Açúcar, AL',
    phone: '0800 710 0004',
    coordinates: [-37.4354987, -9.7494766],
    photo: foto('Pão_braulio')
  },
  {
    id: 'santana-do-ipanema',
    name: "Santana do Ipanema — Camoxinga",
    city: 'Santana do Ipanema',
    state: 'Alagoas',
    uf: 'AL',
    unitType: 'Escritório · Alagoas',
    address: 'Rua Cônego José Bulhões, 85 — Camoxinga, Santana do Ipanema, AL',
    phone: '0800 710 0004',
    coordinates: [-37.247760033286845, -9.371135884429078],
    reference: 'Em frente à padaria Santa Quitéria',
    photo: foto('Santana_conego')
  },
  {
    id: 'sao-miguel-dos-campos',
    name: "São Miguel dos Campos — Centro",
    city: 'São Miguel dos Campos',
    state: 'Alagoas',
    uf: 'AL',
    unitType: 'Escritório · Alagoas',
    address: 'Rua Senador Máximo, 331, comercial — Centro, São Miguel dos Campos, AL',
    phone: '0800 710 0004',
    coordinates: [-36.10104364978315, -9.77971305168764],
    reference: 'Ao lado do Ula Ula',
    photo: foto('Miguel_Senador')
  },
  {
    id: 'sao-sebastiao',
    name: "São Sebastião — Centro",
    city: 'São Sebastião',
    state: 'Alagoas',
    uf: 'AL',
    unitType: 'Filial · Alagoas',
    address: 'Rua Salvino Lima, 55 — Centro, São Sebastião, AL',
    phone: '0800 710 0004',
    coordinates: [-36.553978004443564, -9.93342489818646],
    reference: 'Em frente ao Natacha 3',
    photo: foto('São_Sebastiao_salvino')
  },
  {
    id: 'teotonio-vilela',
    name: "Teotônio Vilela — Centro",
    city: 'Teotônio Vilela',
    state: 'Alagoas',
    uf: 'AL',
    unitType: 'Escritório · Alagoas',
    address: 'Rua Maria Jeane Moreira Sampaio, 1395 — Centro, Teotônio Vilela, AL',
    phone: '0800 710 0004',
    coordinates: [-36.35918381912626, -9.907126550282056],
    reference: 'Em frente à escola Dom Avelar',
    photo: foto('Teotonio_maria')
  },
  {
    id: 'aracaju',
    name: "Aracaju — Suíssa",
    city: 'Aracaju',
    state: 'Sergipe',
    uf: 'SE',
    unitType: 'Escritório Regional · Sergipe',
    address: 'Av. Desembargador Maynard, 1079 — Suíssa, Aracaju, SE',
    phone: '0800 710 0004',
    coordinates: [-37.06733474095536, -10.918865294350386],
    photo: foto('Aracaju_desembargador')
  },
  {
    id: 'brasilia-lagarto',
    name: "Lagarto — Brasília",
    city: 'Lagarto',
    state: 'Sergipe',
    uf: 'SE',
    unitType: 'Escritório · Sergipe',
    address: 'Estrada do Grupo, Casa 2, 2 — Povoado Brasília, Lagarto, SE',
    phone: '0800 710 0004',
    coordinates: [-37.551847033547524, -10.898352744755904],
    reference: 'Próximo à igreja católica, ao lado da Pizzaria Kim Sabores',
    photo: foto('Lagarto_brasilia')
  },
  {
    id: 'colonia-13',
    name: "Lagarto — Colônia Treze",
    city: 'Lagarto',
    state: 'Sergipe',
    uf: 'SE',
    unitType: 'Escritório · Sergipe',
    address: 'Praça Santa Luzia, 38 — Colônia Treze, Lagarto, SE',
    phone: '0800 710 0004',
    coordinates: [-37.550141739788096, -10.986232443515961],
    reference: 'Ao lado de São Domingos Móveis',
    photo: foto('Lagarto_praça')
  },
  {
    id: 'itabaiana',
    name: "Itabaiana — Rotary Club",
    city: 'Itabaiana',
    state: 'Sergipe',
    uf: 'SE',
    unitType: 'Escritório · Sergipe',
    address: 'Rua Manoel Teles de Mendonça, 110 — Rotary Club, Itabaiana, SE',
    phone: '0800 710 0004',
    coordinates: [-37.43513426288805, -10.6877893072178],
    reference: 'Mesma rua da Pão&Mel e da Fênix Móveis',
    photo: foto('Itabaiana_Manoel')
  },
  {
    id: 'itaporanga-dajuda',
    name: "Itaporanga d'Ajuda — Centro",
    city: "Itaporanga d'Ajuda",
    state: 'Sergipe',
    uf: 'SE',
    unitType: 'Escritório · Sergipe',
    address: 'Travessa 15 de Novembro, 62 — Centro, Itaporanga d’Ajuda, SE',
    phone: '0800 710 0004',
    coordinates: [-37.30885414688586, -10.99759950994566],
    reference: 'Na rua do auditório municipal',
    photo: foto('Itaporonga_travessa')
  },
  {
    id: 'lagarto',
    name: "Lagarto — Centro",
    city: 'Lagarto',
    state: 'Sergipe',
    uf: 'SE',
    unitType: 'Filial · Sergipe',
    address: 'Rua Joviniano de Oliveira, 18 — Centro, Lagarto, SE',
    phone: '0800 710 0004',
    coordinates: [-37.66991444860712, -10.918424575740064],
    reference: 'Ponto da Coopervan',
    photo: foto('Lagarto_joviniano')
  },
  {
    id: 'nossa-senhora-da-gloria',
    name: "Nossa Senhora da Glória — Nova Brasília",
    city: 'Nossa Senhora da Glória',
    state: 'Sergipe',
    uf: 'SE',
    unitType: 'Escritório · Sergipe',
    address: 'Rua Senador Leite Neto, 32 — Nova Brasília, Nossa Senhora da Glória, SE',
    phone: '0800 710 0004',
    coordinates: [-37.416957328454245, -10.213565451737173],
    photo: foto('NossaSenhora_senador')
  },
  {
    id: 'salgado',
    name: "Salgado — Centro",
    city: 'Salgado',
    state: 'Sergipe',
    uf: 'SE',
    unitType: 'Escritório · Sergipe',
    address: 'Av. Josias Carvalho, 218 — Centro, Salgado, SE',
    phone: '0800 710 0004',
    coordinates: [-37.4768803, -11.0286967],
    photo: foto('Salgado_josias')
  },
  {
    id: 'sanharo',
    name: "Sanharó — Centro",
    city: 'Sanharó',
    state: 'Pernambuco',
    uf: 'PE',
    unitType: 'Filial · Pernambuco',
    address: 'Rua Major Sátiro, 205 — Centro, Sanharó, PE',
    phone: '0800 710 0004',
    coordinates: [-36.56350973329871, -8.3612940031922],
    reference: 'Ao lado da prefeitura',
    photo: foto('Sanharo_major')
  },
  {
    id: 'sao-bento-do-una',
    name: "São Bento do Una — Centro",
    city: 'São Bento do Una',
    state: 'Pernambuco',
    uf: 'PE',
    unitType: 'Escritório · Pernambuco',
    address: 'Rua Liberato Siqueira, 14 — Centro, São Bento do Una, PE',
    phone: '0800 710 0004',
    coordinates: [-36.445000834033586, -8.519304148163913],
    reference: 'Em frente à praça da igreja matriz',
    photo: foto('São_Bento_liberato')
  },
  {
    id: 'aguas-belas',
    name: "Águas Belas — Centro",
    city: 'Águas Belas',
    state: 'Pernambuco',
    uf: 'PE',
    unitType: 'Escritório · Pernambuco',
    address: 'Rua Coronel Alfredo Duarte, 126 — Centro, Águas Belas, PE',
    phone: '0800 710 0004',
    coordinates: [-37.1163126, -9.1164576],
    photo: foto('Aguas_Coronel')
  },
]

/** Foto institucional, usada como reserva quando a foto da unidade não existe. */
export const HQ_PHOTO = headquartersPhoto
