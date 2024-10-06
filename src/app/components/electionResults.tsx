"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import Image from "next/image"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { X, Loader2, RefreshCw } from "lucide-react"
import { List as VirtualizedList, AutoSizer } from "react-virtualized"
import cities from "@/lib/cities"

interface Candidate {
  id: string
  nomeUrna: string
  partido: string
  votos: number
  percentual: number
  foto: string
}

interface Section {
  id: number
  city: string
  state: string
  vereadores: Candidate[]
  prefeitos: Candidate[]
  percentTotalizedVereador: number
  percentTotalizedPrefeito: number
  lastUpdateVereador: string
  lastUpdatePrefeito: string
  candidateSearch: string
  partyFilter: string | null
}

const seatsPerCity = {}

export default function ElectionResults() {
  const [sections, setSections] = useState<Section[]>([])
  const [citySearch, setCitySearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSelectOpen, setIsSelectOpen] = useState(false)
  const citySearchInputRef = useRef<HTMLInputElement>(null)

  const filteredCities = useMemo(() => {
    return cities.filter((city) =>
      city.state.toLowerCase().includes(citySearch.toLowerCase()),
    )
  }, [citySearch])

  const fetchElectionData = useCallback(async (cityId: string) => {
    setLoading(true)
    setError(null)
    try {
      const city = cities.find((c) => c.id === cityId)
      if (!city) throw new Error("City not found")

      const linkVereador = `https://resultados.tse.jus.br/oficial/ele2024/619/dados/${city.state.toLowerCase()}/${city.state.toLowerCase()}${
        city.id
      }-c0013-e000619-u.json`
      const linkPrefeito = `https://resultados.tse.jus.br/oficial/ele2024/619/dados/${city.state.toLowerCase()}/${city.state.toLowerCase()}${
        city.id
      }-c0011-e000619-u.json`
      const [vereadorResponse, prefeitoResponse] = await Promise.all([
        fetch(linkVereador),
        fetch(linkPrefeito),
      ])

      if (!vereadorResponse.ok || !prefeitoResponse.ok) {
        throw new Error("Failed to fetch election data")
      }

      const [vereadorData, prefeitoData] = await Promise.all([
        vereadorResponse.json(),
        prefeitoResponse.json(),
      ])

      seatsPerCity[cityId] = vereadorData.carg[0].nv

      const vereadores = vereadorData.carg.flatMap((carg: any) =>
        carg.agr.flatMap((agr: any) =>
          agr.par.flatMap((par: any) =>
            par.cand.map((candidate: any) => ({
              id: candidate.sqcand,
              nomeUrna: candidate.nmu,
              partido: par.sg,
              votos: parseInt(candidate.vap), //Math.floor(Math.random() * 10000),
              percentual: parseFloat(candidate.pvap),
              foto: `https://resultados.tse.jus.br/oficial/ele2024/619/fotos/${city.state.toLowerCase()}/${
                candidate.sqcand
              }.jpeg`,
            })),
          ),
        ),
      )

      const prefeitos = prefeitoData.carg.flatMap((carg: any) =>
        carg.agr.flatMap((agr: any) =>
          agr.par.flatMap((par: any) =>
            par.cand.map((candidate: any) => ({
              id: candidate.sqcand,
              nomeUrna: candidate.nmu,
              partido: par.sg,
              votos: parseInt(candidate.vap),
              percentual: parseFloat(candidate.pvap),
              foto: `https://resultados.tse.jus.br/oficial/ele2024/619/fotos/${city.state.toLowerCase()}/${
                candidate.sqcand
              }.jpeg`,
            })),
          ),
        ),
      )

      const percentTotalizedVereador = parseFloat(vereadorData.s.pst)
      const percentTotalizedPrefeito = parseFloat(prefeitoData.s.pst)
      const lastUpdateVereador = `${vereadorData.dg} - ${vereadorData.hg}`
      const lastUpdatePrefeito = `${prefeitoData.dg} - ${prefeitoData.hg}`

      setSections((prevSections) => {
        const existingSection = prevSections.find((s) => s.city === city.name)
        if (existingSection) {
          return prevSections.map((s) =>
            s.id === existingSection.id
              ? {
                  ...s,
                  vereadores,
                  prefeitos,
                  percentTotalizedVereador,
                  percentTotalizedPrefeito,
                  lastUpdateVereador,
                  lastUpdatePrefeito,
                }
              : s,
          )
        } else {
          return [
            ...prevSections,
            {
              id: Date.now(),
              city: city.name,
              state: city.state,
              vereadores,
              prefeitos,
              percentTotalizedVereador,
              percentTotalizedPrefeito,
              candidateSearch: "",
              lastUpdateVereador,
              lastUpdatePrefeito,
              partyFilter: null,
            },
          ]
        }
      })
    } catch (err) {
      console.error(err)
      setError("Error fetching election data. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [])

  const addSection = (cityId: string) => {
    fetchElectionData(cityId)
    setCitySearch("")
    setIsSelectOpen(false)
  }

  const deleteSection = (sectionId: number) => {
    setSections((prevSections) =>
      prevSections.filter((section) => section.id !== sectionId),
    )
  }

  const calculateQuocienteEleitoral = useCallback((section: Section) => {
    const candidates = section.vereadores
    const totalVotes = candidates.reduce(
      (sum, candidate) => sum + candidate.votos,
      0,
    )
    const city = cities.find((c) => c.name === section.city)
    const totalSeats = city ? seatsPerCity[city.id] : 0
    const electoralQuotient = Math.floor(totalVotes / totalSeats)

    const partyVotes = Array.from(
      new Set(candidates.map((c) => c.partido)),
    ).map((party) => ({
      party,
      votes: candidates
        .filter((c) => c.partido === party)
        .reduce((sum, c) => sum + c.votos, 0),
      seats: 0,
    }))

    // First distribution of seats
    partyVotes.forEach((pv) => {
      pv.seats = Math.floor(pv.votes / electoralQuotient)
    })

    // Distribute remaining seats
    let remainingSeats =
      totalSeats - partyVotes.reduce((sum, pv) => sum + pv.seats, 0)
    while (remainingSeats > 0) {
      const sortedParties = [...partyVotes].sort(
        (a, b) => b.votes / (b.seats + 1) - a.votes / (a.seats + 1),
      )
      sortedParties[0].seats += 1
      remainingSeats -= 1
    }

    return partyVotes.sort((a, b) => b.seats - a.seats)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      sections.forEach((section) => {
        const city = cities.find((c) => c.name === section.city)
        if (city) {
          fetchElectionData(city.id)
        }
      })
    }, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [sections, fetchElectionData])

  const forceUpdate = () => {
    sections.forEach((section) => {
      const city = cities.find((c) => c.name === section.city)
      if (city) {
        fetchElectionData(city.id)
      }
    })
  }

  const updateSectionSearch = useCallback(
    (sectionId: number, search: string) => {
      setSections((prevSections) =>
        prevSections.map((section) =>
          section.id === sectionId
            ? { ...section, candidateSearch: search }
            : section,
        ),
      )
    },
    [],
  )

  const updateSectionPartyFilter = useCallback(
    (sectionId: number, party: string | null) => {
      setSections((prevSections) =>
        prevSections.map((section) =>
          section.id === sectionId
            ? { ...section, partyFilter: party }
            : section,
        ),
      )
    },
    [],
  )

  const renderCity = ({ index, key, style }) => {
    const city = filteredCities[index]
    return (
      <SelectItem key={key} value={city.id} style={style}>
        {city.name} - {city.state}
      </SelectItem>
    )
  }

  const handleCitySearchChange = (e: string) => {
    setCitySearch(e)
    if (citySearchInputRef.current) {
      citySearchInputRef.current.focus()
    }
  }

  const renderCandidateList = useCallback(({ index, key, style, data }) => {
    const candidate = data[index]
    return (
      <div key={key} style={style} className="flex items-center space-x-2 py-2">
        <img
          src={candidate.foto}
          alt={candidate.nomeUrna}
          width={40}
          height={40}
          className="rounded-full"
        />
        <div>
          <div className="font-semibold">{candidate.nomeUrna}</div>
          <div className="text-sm text-muted-foreground">
            {candidate.partido} - {candidate.votos} votos (
            {candidate.percentual.toFixed(2)}%)
          </div>
        </div>
      </div>
    )
  }, [])

  return (
    <div className="flex flex-col min-h-screen">
      <div className="p-4 py-0 border-b">
        <div className="flex flex-col md:flex-row items-center space-y-4 md:space-y-0 md:space-x-6">
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/3/32/Movimento_Brasil_Livre_logo.svg"
            width={100}
            height={100}
            alt="MBL"
            className="w-24 h-24 md:w-32 md:h-32"
          />
          <h2 className="font-semibold text-2xl md:text-3xl text-center md:text-left">
            Apuração Eleitoral - Eleições 2024
          </h2>
          <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-2 w-full md:w-auto">
            <Select
              onValueChange={addSection}
              open={isSelectOpen}
              onOpenChange={setIsSelectOpen}
            >
              <SelectTrigger className="w-full md:w-[300px]">
                <SelectValue placeholder="Adicionar cidade" />
              </SelectTrigger>
              <SelectContent>
                <Select onValueChange={handleCitySearchChange}>
                  <SelectTrigger className="w-full my-4">
                    <SelectValue placeholder="Selecione um estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from(new Set(cities.map((city) => city.state))).map(
                      (state) => (
                        <SelectItem key={state} value={state.toLowerCase()}>
                          {state}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
                <VirtualizedList
                  width={300}
                  height={200}
                  rowCount={filteredCities.length}
                  rowHeight={35}
                  rowRenderer={renderCity}
                />
              </SelectContent>
            </Select>
            <Button onClick={forceUpdate} className="w-full md:w-auto">
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar Dados
            </Button>
          </div>
        </div>
      </div>
      {loading && (
        <div className="flex items-center justify-center p-4">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando dados...
        </div>
      )}
      {error && <div className="text-red-500 p-4">{error}</div>}
      <ScrollArea className="flex-1">
        <div className="flex p-4 space-x-4 md:flex-nowrap sm:flex-wrap overflow-x-auto md:overflow-x-hidden">
          {sections.map((section) => (
            <Card
              key={section.id}
              className="w-full md:w-[400px] flex-shrink-0"
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xl md:text-2xl">
                  {section.city} - {section.state}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteSection(section.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="vereador">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="vereador">Vereador</TabsTrigger>
                    <TabsTrigger value="prefeito">Prefeito</TabsTrigger>
                  </TabsList>
                  <TabsContent value="vereador">
                    <div className="mb-1">
                      <span className="font-semibold">
                        Seções totalizadas:{" "}
                      </span>
                      {section.percentTotalizedVereador.toFixed(2)}%
                    </div>
                    <span className="font-semibold">Última Atualização: </span>
                    {section.lastUpdateVereador}
                    <div className="mb-4"></div>
                    <div className="space-y-2">
                      <Select
                        onValueChange={(value) =>
                          updateSectionPartyFilter(
                            section.id,
                            value === "all" ? null : value,
                          )
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Filtrar por partido" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          {Array.from(
                            new Set(section.vereadores.map((c) => c.partido)),
                          ).map((party) => (
                            <SelectItem key={party} value={party}>
                              {party}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Pesquisar candidato..."
                        value={section.candidateSearch}
                        onChange={(e) =>
                          updateSectionSearch(section.id, e.target.value)
                        }
                      />
                    </div>
                    <div className="h-[400px] mt-2">
                      <AutoSizer>
                        {({ height, width }) => (
                          <VirtualizedList
                            width={width}
                            height={height}
                            rowCount={
                              section.vereadores.filter(
                                (candidate) =>
                                  (!section.partyFilter ||
                                    candidate.partido ===
                                      section.partyFilter) &&
                                  candidate.nomeUrna
                                    .toLowerCase()
                                    .includes(
                                      section.candidateSearch.toLowerCase(),
                                    ),
                              ).length
                            }
                            rowHeight={60}
                            rowRenderer={(props) =>
                              renderCandidateList({
                                ...props,
                                data: section.vereadores.filter(
                                  (candidate) =>
                                    (!section.partyFilter ||
                                      candidate.partido ===
                                        section.partyFilter) &&
                                    candidate.nomeUrna
                                      .toLowerCase()
                                      .includes(
                                        section.candidateSearch.toLowerCase(),
                                      ),
                                ),
                              })
                            }
                          />
                        )}
                      </AutoSizer>
                    </div>
                  </TabsContent>
                  <TabsContent value="prefeito">
                    <div className="mb-1">
                      <span className="font-semibold">
                        Seções totalizadas:{" "}
                      </span>
                      {section.percentTotalizedPrefeito.toFixed(2)}%
                    </div>
                    <span className="font-semibold">Última Atualização: </span>
                    {section.lastUpdatePrefeito}
                    <div className="mb-4"></div>
                    <div className="h-[400px]">
                      <AutoSizer>
                        {({ height, width }) => (
                          <VirtualizedList
                            width={width}
                            height={height}
                            rowCount={section.prefeitos.length}
                            rowHeight={60}
                            rowRenderer={(props) =>
                              renderCandidateList({
                                ...props,
                                data: section.prefeitos,
                              })
                            }
                          />
                        )}
                      </AutoSizer>
                    </div>
                  </TabsContent>
                </Tabs>
                <div className="mt-4">
                  <h3 className="font-semibold">
                    Quociente Eleitoral (Vereadores)
                  </h3>
                  <ScrollArea className="h-[200px] mt-2">
                    {calculateQuocienteEleitoral(section).map(
                      (result, index) => (
                        <div key={index} className="flex justify-between py-1">
                          <span>{result.party}</span>
                          <span>
                            {result.seats || "Sem"} cadeiras ({result.votes}{" "}
                            votos)
                          </span>
                        </div>
                      ),
                    )}
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}
