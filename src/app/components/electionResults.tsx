"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
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
import { List as VirtualizedList } from "react-virtualized"
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
  percentTotalized: number
  candidateSearch: string
  partyFilter: string | null
}

const seatsPerParty = {}

export default function ElectionResults() {
  const [sections, setSections] = useState<Section[]>([])
  const [citySearch, setCitySearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filteredCities = useMemo(() => {
    return cities.filter(
      (city) =>
        city.name.toLowerCase().includes(citySearch.toLowerCase()) ||
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

      seatsPerParty[cityId] = vereadorData.carg.nv

      const vereadores = vereadorData.carg.flatMap((carg: any) =>
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

      const percentTotalized = parseFloat(vereadorData.s.pst)

      setSections((prevSections) => {
        const existingSection = prevSections.find((s) => s.city === city.name)
        if (existingSection) {
          return prevSections.map((s) =>
            s.id === existingSection.id
              ? { ...s, vereadores, prefeitos, percentTotalized }
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
              percentTotalized,
              candidateSearch: "",
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
    const totalSeats = seatsPerParty[section.city]
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
    const remainingSeats =
      totalSeats - partyVotes.reduce((sum, pv) => sum + pv.seats, 0)
    const sortedParties = [...partyVotes].sort(
      (a, b) => (b.votes % electoralQuotient) - (a.votes % electoralQuotient),
    )
    for (let i = 0; i < remainingSeats; i++) {
      sortedParties[i].seats += 1
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

  return (
    <div className="flex flex-col h-screen">
      <div className="p-4 border-b">
        <div className="flex items-center space-x-6">
          <Image
            src="https://upload.wikimedia.org/wikipedia/commons/3/32/Movimento_Brasil_Livre_logo.svg"
            width={150}
            height={150}
            alt="MBL"
          />
          <h2 className="font-semibold text-3xl">
            Apuração Eleitoral - Eleições 2024
          </h2>
          <Select onValueChange={addSection}>
            <SelectTrigger className="w-[300px]">
              <SelectValue placeholder="Adicionar cidade" />
            </SelectTrigger>
            <SelectContent>
              <Input
                placeholder="Pesquisar cidade..."
                value={citySearch}
                onChange={(e) => setCitySearch(e.target.value)}
                className="mb-2"
              />
              <VirtualizedList
                width={300}
                height={200}
                rowCount={filteredCities.length}
                rowHeight={35}
                rowRenderer={renderCity}
              />
            </SelectContent>
          </Select>
          <Button onClick={forceUpdate}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar Dados
          </Button>
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
        <div className="flex p-4 space-x-4">
          {sections.map((section) => (
            <Card key={section.id} className="w-[400px] flex-shrink-0">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-2xl">
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
                <div className="mb-4">
                  <span className="font-semibold">Seções totalizadas: </span>
                  {section.percentTotalized.toFixed(2)}%
                </div>
                <Tabs defaultValue="vereador">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="vereador">Vereador</TabsTrigger>
                    <TabsTrigger value="prefeito">Prefeito</TabsTrigger>
                  </TabsList>
                  <TabsContent value="vereador">
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
                    <ScrollArea className="h-[400px] mt-2">
                      {section.vereadores
                        .filter(
                          (candidate) =>
                            (!section.partyFilter ||
                              candidate.partido === section.partyFilter) &&
                            candidate.nomeUrna
                              .toLowerCase()
                              .includes(section.candidateSearch.toLowerCase()),
                        )
                        .map((candidate) => (
                          <div
                            key={candidate.id}
                            className="flex items-center space-x-2 py-2"
                          >
                            <Image
                              src={candidate.foto}
                              alt={candidate.nomeUrna}
                              width={40}
                              height={40}
                              className="rounded-full"
                            />
                            <div>
                              <div className="font-semibold">
                                {candidate.nomeUrna}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {candidate.partido} - {candidate.votos} votos (
                                {candidate.percentual.toFixed(2)}%)
                              </div>
                            </div>
                          </div>
                        ))}
                    </ScrollArea>
                  </TabsContent>
                  <TabsContent value="prefeito">
                    <ScrollArea className="h-[400px]">
                      {section.prefeitos.map((candidate) => (
                        <div
                          key={candidate.id}
                          className="flex items-center space-x-2 py-2"
                        >
                          <Image
                            src={candidate.foto}
                            alt={candidate.nomeUrna}
                            width={40}
                            height={40}
                            className="rounded-full"
                          />
                          <div>
                            <div className="font-semibold">
                              {candidate.nomeUrna}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {candidate.partido} - {candidate.votos} votos (
                              {candidate.percentual.toFixed(2)}%)
                            </div>
                          </div>
                        </div>
                      ))}
                    </ScrollArea>
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